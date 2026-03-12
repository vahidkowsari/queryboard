#!/bin/bash

set -e

if [ -z "$AWS_PROFILE" ]; then
    echo "Error: AWS_PROFILE environment variable is required."
    echo "Usage: AWS_PROFILE=your-profile $0"
    exit 1
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
TF_DIR="$(dirname "$0")/../deploy/terraform"
PROJECT_NAME="queryboard"
ENVIRONMENT="prod"
SERVICE_NAME="${PROJECT_NAME}-${ENVIRONMENT}-backend"
LOCAL_PORT="5435"

# --- Helpers ---

tf_output() {
    terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null
}

error() { gum style --foreground 1 "✗ $*"; }
success() { gum style --foreground 2 "✓ $*"; }
info() { gum style --foreground 4 "→ $*"; }

get_ecs_task() {
    local cluster
    cluster=$(tf_output ecs_cluster_name)
    if [ -z "$cluster" ]; then
        error "Could not get ECS cluster name from Terraform."
        return 1
    fi

    local task_arn
    task_arn=$(AWS_PROFILE=$AWS_PROFILE aws ecs list-tasks \
        --cluster "$cluster" \
        --service-name "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'taskArns[0]' \
        --output text 2>&1)

    if [ $? -ne 0 ]; then
        error "AWS CLI failed. Check credentials."
        info "Try: aws sso login --profile $AWS_PROFILE"
        return 1
    fi

    if [ "$task_arn" == "None" ] || [ -z "$task_arn" ]; then
        error "No running tasks found for service: ${SERVICE_NAME}"
        return 1
    fi

    echo "$task_arn"
}

# --- Actions ---

tail_logs() {
    local log_group="/ecs/${PROJECT_NAME}-${ENVIRONMENT}/backend"
    info "Log group: $log_group"
    info "Press Ctrl+C to stop"
    echo ""
    AWS_PROFILE=$AWS_PROFILE aws logs tail "$log_group" --follow --since 10m --region "$AWS_REGION"
}

port_forward_db() {
    local task
    task=$(get_ecs_task) || return 1

    local cluster rds_host task_id runtime_id target
    cluster=$(tf_output ecs_cluster_name)
    rds_host=$(tf_output rds_endpoint | cut -d: -f1)
    task_id="${task##*/}"

    runtime_id=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
        --cluster "$cluster" \
        --tasks "$task" \
        --region "$AWS_REGION" \
        --query 'tasks[0].containers[0].runtimeId' \
        --output text)

    if [ "$runtime_id" == "None" ] || [ -z "$runtime_id" ]; then
        error "SSM agent not ready. Wait a moment and try again."
        return 1
    fi

    target="ecs:${cluster}_${task_id}_${runtime_id}"

    info "Cluster:  $cluster"
    info "Task:     $task_id"
    info "RDS Host: $rds_host"
    echo ""
    success "Port forward active on localhost:${LOCAL_PORT}"
    info "Connect: psql -h localhost -p ${LOCAL_PORT} -U queryboard -d queryboard"
    echo ""
    info "Press Ctrl+C to stop"
    echo ""

    AWS_PROFILE=$AWS_PROFILE aws ssm start-session \
        --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$rds_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
        --region "$AWS_REGION"
}

backup_db() {
    local timestamp backup_dir backup_file
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_dir="$(dirname "$0")/../backups"
    backup_file="${backup_dir}/queryboard_${timestamp}.sql"
    local rds_host
    rds_host=$(tf_output rds_endpoint | cut -d: -f1)

    echo ""
    gum style --bold "Backup destination:"
    info "$backup_file"
    info "RDS Host: $rds_host"
    echo ""
    gum confirm "Start backup?" || return 0

    local task
    task=$(get_ecs_task) || return 1

    local cluster task_id runtime_id target
    cluster=$(tf_output ecs_cluster_name)
    task_id="${task##*/}"
    runtime_id=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
        --cluster "$cluster" \
        --tasks "$task" \
        --region "$AWS_REGION" \
        --query 'tasks[0].containers[0].runtimeId' \
        --output text)

    if [ "$runtime_id" == "None" ] || [ -z "$runtime_id" ]; then
        error "SSM agent not ready."
        return 1
    fi

    target="ecs:${cluster}_${task_id}_${runtime_id}"
    mkdir -p "$backup_dir"

    AWS_PROFILE=$AWS_PROFILE aws ssm start-session \
        --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$rds_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
        --region "$AWS_REGION" &
    local tunnel_pid=$!

    gum spin --spinner dot --title "Establishing tunnel..." -- sleep 5

    gum spin --spinner dot --title "Running pg_dump..." -- \
        bash -c "PGPASSWORD='${DB_PASSWORD}' pg_dump -h localhost -p $LOCAL_PORT -U queryboard -d queryboard -F c -f '$backup_file'"

    kill $tunnel_pid 2>/dev/null || true

    if [ -f "$backup_file" ]; then
        local size
        size=$(ls -lh "$backup_file" | awk '{print $5}')
        echo ""
        success "Backup complete: $(basename "$backup_file") ($size)"
    else
        error "Backup failed."
        return 1
    fi
}

restore_db() {
    local backup_dir
    backup_dir="$(dirname "$0")/../backups"

    local backups
    mapfile -t backups < <(ls -1t "$backup_dir"/queryboard_*.sql 2>/dev/null)

    if [ ${#backups[@]} -eq 0 ]; then
        error "No backups found in: $backup_dir"
        return 1
    fi

    # Build display list for gum choose
    local labels=()
    for backup in "${backups[@]}"; do
        local filename size
        filename=$(basename "$backup")
        size=$(ls -lh "$backup" | awk '{print $5}')
        labels+=("$filename  ($size)")
    done

    echo ""
    gum style --bold "Select a backup to restore:"
    local selected
    selected=$(printf '%s\n' "${labels[@]}" | gum choose) || return 0

    # Match selection back to file
    local backup_file=""
    for backup in "${backups[@]}"; do
        if [[ "$selected" == "$(basename "$backup")"* ]]; then
            backup_file="$backup"
            break
        fi
    done

    echo ""
    gum style --foreground 1 --bold "WARNING: This will OVERWRITE the production database!"
    info "Backup: $(basename "$backup_file")"
    echo ""
    gum confirm --default=false "Are you absolutely sure?" || return 0

    local rds_host
    rds_host=$(tf_output rds_endpoint | cut -d: -f1)

    local task
    task=$(get_ecs_task) || return 1

    local cluster task_id runtime_id target
    cluster=$(tf_output ecs_cluster_name)
    task_id="${task##*/}"
    runtime_id=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
        --cluster "$cluster" \
        --tasks "$task" \
        --region "$AWS_REGION" \
        --query 'tasks[0].containers[0].runtimeId' \
        --output text)

    if [ "$runtime_id" == "None" ] || [ -z "$runtime_id" ]; then
        error "SSM agent not ready."
        return 1
    fi

    target="ecs:${cluster}_${task_id}_${runtime_id}"

    AWS_PROFILE=$AWS_PROFILE aws ssm start-session \
        --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$rds_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
        --region "$AWS_REGION" &
    local tunnel_pid=$!

    gum spin --spinner dot --title "Establishing tunnel..." -- sleep 5

    gum spin --spinner dot --title "Running pg_restore..." -- \
        bash -c "PGPASSWORD='${DB_PASSWORD}' pg_restore -h localhost -p $LOCAL_PORT -U queryboard -d queryboard -c --if-exists '$backup_file'"

    kill $tunnel_pid 2>/dev/null || true

    echo ""
    success "Restore complete!"
}

show_outputs() {
    echo ""
    gum style --bold "Terraform Outputs"
    echo ""
    printf "  %-16s %s\n" "ECS Cluster:"   "$(tf_output ecs_cluster_name)"
    printf "  %-16s %s\n" "ECR Repo:"      "$(tf_output ecr_repository_url)"
    printf "  %-16s %s\n" "ALB DNS:"       "$(tf_output alb_dns_name)"
    printf "  %-16s %s\n" "CloudFront:"    "$(tf_output cloudfront_domain)"
    printf "  %-16s %s\n" "CF Dist ID:"    "$(tf_output cloudfront_distribution_id)"
    printf "  %-16s %s\n" "Frontend S3:"   "$(tf_output frontend_bucket)"
    printf "  %-16s %s\n" "API Domain:"    "$(tf_output api_domain)"
    printf "  %-16s %s\n" "Web Domain:"    "$(tf_output web_domain)"
    echo ""
}

# --- Interactive menu ---

interactive_menu() {
    while true; do
        echo ""
        gum style \
            --border normal --border-foreground 99 \
            --padding "0 2" --margin "0 1" \
            --bold "QueryBoard CLI" \
            "env: ${ENVIRONMENT}  |  region: ${AWS_REGION}"
        echo ""

        local choice
        choice=$(gum choose \
            "Tail ECS logs" \
            "Port forward DB  (localhost:${LOCAL_PORT})" \
            "Backup database" \
            "Restore database" \
            "Show Terraform outputs" \
            "Quit") || break

        echo ""
        case $choice in
            "Tail ECS logs")                    tail_logs ;;
            "Port forward DB"*)                 port_forward_db ;;
            "Backup database")                  backup_db ;;
            "Restore database")                 restore_db ;;
            "Show Terraform outputs")           show_outputs ;;
            "Quit")                             break ;;
        esac

        echo ""
        gum confirm "Return to menu?" || break
    done

    echo ""
}

# --- CLI entry ---

if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    cat <<EOF
QueryBoard CLI

Usage: $0 [command]

Interactive mode (no arguments):
  $0

Direct commands:
  $0 logs       Tail ECS logs
  $0 tunnel     Port forward DB to localhost:${LOCAL_PORT}
  $0 backup     Backup database
  $0 restore    Restore database
  $0 outputs    Show Terraform outputs

Environment variables:
  AWS_PROFILE   (required)
  AWS_REGION    (default: us-east-1)
  DB_PASSWORD   (required for backup/restore)
EOF
    exit 0
fi

if [ -n "$1" ]; then
    case $1 in
        logs)    tail_logs ;;
        tunnel)  port_forward_db ;;
        backup)  backup_db ;;
        restore) restore_db ;;
        outputs) show_outputs ;;
        *) echo "Unknown command: $1"; exit 1 ;;
    esac
else
    interactive_menu
fi
