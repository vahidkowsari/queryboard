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

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

tf_output() {
    terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null
}

print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          QueryBoard CLI                ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

print_menu() {
    echo -e "${YELLOW}Environment: ${GREEN}${ENVIRONMENT}${NC}  |  ${YELLOW}Region: ${GREEN}${AWS_REGION}${NC}"
    echo ""
    echo "  1) Tail ECS logs"
    echo "  2) Port forward DB (localhost:${LOCAL_PORT})"
    echo "  3) Backup DB"
    echo "  4) Restore DB"
    echo "  5) Show Terraform outputs"
    echo ""
    echo "  q) Quit"
    echo ""
}

get_ecs_task() {
    local cluster=$(tf_output ecs_cluster_name)
    if [ -z "$cluster" ]; then
        echo -e "${RED}Could not get ECS cluster name from Terraform.${NC}" >&2
        return 1
    fi

    local task_arn
    task_arn=$(AWS_PROFILE=$AWS_PROFILE aws ecs list-tasks \
        --cluster "$cluster" \
        --service-name "$SERVICE_NAME" \
        --region $AWS_REGION \
        --query 'taskArns[0]' \
        --output text 2>&1)

    if [ $? -ne 0 ]; then
        echo -e "${RED}AWS CLI failed. Check credentials.${NC}" >&2
        echo -e "${YELLOW}Try: aws sso login --profile $AWS_PROFILE${NC}" >&2
        return 1
    fi

    if [ "$task_arn" == "None" ] || [ -z "$task_arn" ]; then
        echo -e "${RED}No running tasks found for service '${SERVICE_NAME}'.${NC}" >&2
        return 1
    fi

    echo "$task_arn"
}

tail_logs() {
    local log_group="/ecs/${PROJECT_NAME}-${ENVIRONMENT}/backend"

    echo -e "${YELLOW}Tailing ECS logs...${NC}"
    echo -e "${GREEN}Log group: $log_group${NC}"
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""

    AWS_PROFILE=$AWS_PROFILE aws logs tail "$log_group" --follow --since 10m --region $AWS_REGION
}

port_forward_db() {
    echo -e "${YELLOW}Starting port forward to database...${NC}"

    local task=$(get_ecs_task)
    if [ $? -ne 0 ] || [ -z "$task" ]; then
        return 1
    fi

    local cluster=$(tf_output ecs_cluster_name)
    local rds_host=$(tf_output rds_endpoint | cut -d: -f1)
    local task_id="${task##*/}"

    local runtime_id=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
        --cluster "$cluster" \
        --tasks "$task" \
        --region $AWS_REGION \
        --query 'tasks[0].containers[0].runtimeId' \
        --output text)

    if [ "$runtime_id" == "None" ] || [ -z "$runtime_id" ]; then
        echo -e "${RED}SSM agent not ready. Wait a moment and try again.${NC}"
        return 1
    fi

    local target="ecs:${cluster}_${task_id}_${runtime_id}"

    echo -e "${GREEN}Cluster:  $cluster${NC}"
    echo -e "${GREEN}Task:     $task_id${NC}"
    echo -e "${GREEN}RDS Host: $rds_host${NC}"
    echo ""
    echo -e "${GREEN}Port forward starting on localhost:${LOCAL_PORT}${NC}"
    echo -e "${YELLOW}Connect: psql -h localhost -p ${LOCAL_PORT} -U postgres -d queryboard${NC}"
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""

    AWS_PROFILE=$AWS_PROFILE aws ssm start-session \
        --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$rds_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
        --region $AWS_REGION
}

backup_db() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="$(dirname "$0")/../backups"
    local backup_file="${backup_dir}/queryboard_${timestamp}.sql"

    mkdir -p "$backup_dir"

    echo -e "${YELLOW}Backing up database...${NC}"

    local rds_host=$(tf_output rds_endpoint | cut -d: -f1)

    echo -e "${GREEN}RDS Host:    $rds_host${NC}"
    echo -e "${GREEN}Backup file: $backup_file${NC}"
    echo ""

    # Start tunnel
    local task=$(get_ecs_task)
    if [ $? -ne 0 ] || [ -z "$task" ]; then
        return 1
    fi

    local cluster=$(tf_output ecs_cluster_name)
    local task_id="${task##*/}"
    local runtime_id=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
        --cluster "$cluster" \
        --tasks "$task" \
        --region $AWS_REGION \
        --query 'tasks[0].containers[0].runtimeId' \
        --output text)

    if [ "$runtime_id" == "None" ] || [ -z "$runtime_id" ]; then
        echo -e "${RED}SSM agent not ready.${NC}"
        return 1
    fi

    local target="ecs:${cluster}_${task_id}_${runtime_id}"

    AWS_PROFILE=$AWS_PROFILE aws ssm start-session \
        --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$rds_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
        --region $AWS_REGION &
    local tunnel_pid=$!

    echo "Waiting for tunnel to establish..."
    sleep 5

    echo -e "${YELLOW}Running pg_dump...${NC}"
    PGPASSWORD="${DB_PASSWORD}" pg_dump -h localhost -p $LOCAL_PORT -U postgres -d queryboard -F c -f "$backup_file"

    kill $tunnel_pid 2>/dev/null || true

    if [ -f "$backup_file" ]; then
        local size=$(ls -lh "$backup_file" | awk '{print $5}')
        echo ""
        echo -e "${GREEN}Backup complete!${NC}"
        echo -e "${GREEN}File: $backup_file ($size)${NC}"
    else
        echo -e "${RED}Backup failed${NC}"
        return 1
    fi
}

restore_db() {
    local backup_dir="$(dirname "$0")/../backups"

    echo -e "${YELLOW}Available backups:${NC}"
    echo ""

    local backups=($(ls -1t "$backup_dir"/queryboard_*.sql 2>/dev/null))

    if [ ${#backups[@]} -eq 0 ]; then
        echo -e "${RED}No backups found${NC}"
        return 1
    fi

    local i=1
    for backup in "${backups[@]}"; do
        local filename=$(basename "$backup")
        local size=$(ls -lh "$backup" | awk '{print $5}')
        echo "  $i) $filename ($size)"
        ((i++))
    done
    echo ""
    echo "  0) Cancel"
    echo ""

    read -p "Select backup to restore: " choice

    if [ "$choice" == "0" ] || [ -z "$choice" ]; then
        echo "Cancelled"
        return 0
    fi

    local idx=$((choice - 1))
    if [ $idx -lt 0 ] || [ $idx -ge ${#backups[@]} ]; then
        echo -e "${RED}Invalid selection${NC}"
        return 1
    fi

    local backup_file="${backups[$idx]}"

    echo ""
    echo -e "${RED}WARNING: This will OVERWRITE the database!${NC}"
    echo -e "${RED}Backup: $(basename $backup_file)${NC}"
    echo ""
    read -p "Type 'yes' to confirm: " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Cancelled"
        return 0
    fi

    echo -e "${YELLOW}Restoring database...${NC}"

    local rds_host=$(tf_output rds_endpoint | cut -d: -f1)

    local task=$(get_ecs_task)
    if [ $? -ne 0 ] || [ -z "$task" ]; then
        return 1
    fi

    local cluster=$(tf_output ecs_cluster_name)
    local task_id="${task##*/}"
    local runtime_id=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
        --cluster "$cluster" \
        --tasks "$task" \
        --region $AWS_REGION \
        --query 'tasks[0].containers[0].runtimeId' \
        --output text)

    if [ "$runtime_id" == "None" ] || [ -z "$runtime_id" ]; then
        echo -e "${RED}SSM agent not ready.${NC}"
        return 1
    fi

    local target="ecs:${cluster}_${task_id}_${runtime_id}"

    AWS_PROFILE=$AWS_PROFILE aws ssm start-session \
        --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"host\":[\"$rds_host\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
        --region $AWS_REGION &
    local tunnel_pid=$!

    echo "Waiting for tunnel to establish..."
    sleep 5

    echo -e "${YELLOW}Running pg_restore...${NC}"
    PGPASSWORD="${DB_PASSWORD}" pg_restore -h localhost -p $LOCAL_PORT -U postgres -d queryboard -c --if-exists "$backup_file"

    kill $tunnel_pid 2>/dev/null || true

    echo ""
    echo -e "${GREEN}Restore complete!${NC}"
}

show_outputs() {
    echo -e "${YELLOW}Terraform outputs:${NC}"
    echo ""
    echo -e "  ${GREEN}ECS Cluster:   ${NC}$(tf_output ecs_cluster_name)"
    echo -e "  ${GREEN}ECR Repo:      ${NC}$(tf_output ecr_repository_url)"
    echo -e "  ${GREEN}ALB DNS:       ${NC}$(tf_output alb_dns_name)"
    echo -e "  ${GREEN}CloudFront:    ${NC}$(tf_output cloudfront_domain)"
    echo -e "  ${GREEN}CF Dist ID:    ${NC}$(tf_output cloudfront_distribution_id)"
    echo -e "  ${GREEN}Frontend S3:   ${NC}$(tf_output frontend_bucket)"
    echo -e "  ${GREEN}API Domain:    ${NC}$(tf_output api_domain)"
    echo -e "  ${GREEN}Web Domain:    ${NC}$(tf_output web_domain)"
    echo ""
}

# --- Interactive menu ---

interactive_menu() {
    while true; do
        print_header
        print_menu
        read -p "Select option: " choice

        case $choice in
            1) tail_logs ;;
            2) port_forward_db ;;
            3) backup_db ;;
            4) restore_db ;;
            5) show_outputs ;;
            q|Q) exit 0 ;;
            *) echo -e "${RED}Invalid option${NC}" ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
    done
}

# --- CLI entry ---

if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "QueryBoard CLI"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Interactive mode (no arguments):"
    echo "  $0"
    echo ""
    echo "Direct commands:"
    echo "  $0 logs              - Tail ECS logs"
    echo "  $0 tunnel            - Port forward DB to localhost:${LOCAL_PORT}"
    echo "  $0 backup            - Backup database"
    echo "  $0 restore           - Restore database"
    echo "  $0 outputs           - Show Terraform outputs"
    echo ""
    echo "Environment variables:"
    echo "  AWS_PROFILE  (required)"
    echo "  AWS_REGION   (default: us-east-1)"
    echo "  DB_PASSWORD  (required for backup/restore)"
    exit 0
fi

if [ -n "$1" ]; then
    case $1 in
        logs) tail_logs ;;
        tunnel) port_forward_db ;;
        backup) backup_db ;;
        restore) restore_db ;;
        outputs) show_outputs ;;
        *) echo "Unknown command: $1"; exit 1 ;;
    esac
else
    interactive_menu
fi
