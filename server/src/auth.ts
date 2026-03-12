import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session/index.js'
import ThirdParty from 'supertokens-node/recipe/thirdparty/index.js'
import EmailPassword from 'supertokens-node/recipe/emailpassword/index.js'
import UserRoles from 'supertokens-node/recipe/userroles/index.js'
import { config } from './config.js'

export const ROLES = { ADMIN: 'admin', EDITOR: 'editor', VIEWER: 'viewer' } as const
export type AppRole = (typeof ROLES)[keyof typeof ROLES]

/**
 * Initializes SuperTokens authentication with email/password and OAuth providers
 * Configures role-based access control and email domain restrictions
 */
export function initSuperTokens() {
  supertokens.init({
    framework: 'express',
    supertokens: {
      connectionURI: config.supertokens.connectionURI,
      ...(config.supertokens.apiKey ? { apiKey: config.supertokens.apiKey } : {}),
    },
    appInfo: {
      appName: 'QueryBoard',
      apiDomain: config.supertokens.apiDomain,
      websiteDomain: config.supertokens.websiteDomain,
      apiBasePath: '/auth',
      websiteBasePath: '/auth',
    },
    recipeList: [
      EmailPassword.init({
        override: {
          functions: (originalImplementation) => ({
            ...originalImplementation,
            signUp: async (input) => {
              if (config.supertokens.allowedEmailDomain) {
                if (!input.email.includes('@')) {
                  throw new Error('Invalid email format.')
                }
                const domain = input.email.split('@')[1]
                if (domain !== config.supertokens.allowedEmailDomain) {
                  throw new Error(
                    `Only @${config.supertokens.allowedEmailDomain} accounts are allowed.`,
                  )
                }
              }
              const result = await originalImplementation.signUp(input)
              if (result.status === 'OK' && result.recipeUserId) {
                await assignDefaultRole(result.user.id)
              }
              return result
            },
            signIn: async (input) => {
              if (config.supertokens.allowedEmailDomain) {
                if (!input.email.includes('@')) {
                  throw new Error('Invalid email format.')
                }
                const domain = input.email.split('@')[1]
                if (domain !== config.supertokens.allowedEmailDomain) {
                  throw new Error(
                    `Only @${config.supertokens.allowedEmailDomain} accounts are allowed.`,
                  )
                }
              }
              return originalImplementation.signIn(input)
            },
          }),
        },
      }),
      ThirdParty.init({
        signInAndUpFeature: {
          providers: [
            ...(config.supertokens.googleClientId
              ? [
                  {
                    config: {
                      thirdPartyId: 'google',
                      clients: [
                        {
                          clientId: config.supertokens.googleClientId,
                          clientSecret: config.supertokens.googleClientSecret,
                        },
                      ],
                    },
                  },
                ]
              : []),
            ...(config.supertokens.githubClientId
              ? [
                  {
                    config: {
                      thirdPartyId: 'github',
                      clients: [
                        {
                          clientId: config.supertokens.githubClientId,
                          clientSecret: config.supertokens.githubClientSecret,
                        },
                      ],
                    },
                  },
                ]
              : []),
            ...(config.supertokens.microsoftClientId
              ? [
                  {
                    config: {
                      thirdPartyId: 'active-directory',
                      oidcDiscoveryEndpoint: 'https://login.microsoftonline.com/common/v2.0',
                      clients: [
                        {
                          clientId: config.supertokens.microsoftClientId,
                          clientSecret: config.supertokens.microsoftClientSecret,
                        },
                      ],
                    },
                  },
                ]
              : []),
            ...(config.supertokens.oktaClientId && config.supertokens.oktaDomain
              ? [
                  {
                    config: {
                      thirdPartyId: 'okta',
                      name: 'Okta',
                      oidcDiscoveryEndpoint: `https://${config.supertokens.oktaDomain}/.well-known/openid-configuration`,
                      clients: [
                        {
                          clientId: config.supertokens.oktaClientId,
                          clientSecret: config.supertokens.oktaClientSecret,
                        },
                      ],
                    },
                  },
                ]
              : []),
          ],
        },
        override: {
          functions: (originalImplementation) => ({
            ...originalImplementation,
            signInUp: async (input) => {
              const result = await originalImplementation.signInUp(input)
              if (result.status === 'OK' && config.supertokens.allowedEmailDomain) {
                const email = result.user.emails[0]
                const domain = email?.split('@')[1]
                if (domain !== config.supertokens.allowedEmailDomain) {
                  throw new Error(
                    `Only @${config.supertokens.allowedEmailDomain} accounts are allowed.`,
                  )
                }
              }
              if (result.status === 'OK' && result.createdNewRecipeUser) {
                await assignDefaultRole(result.user.id)
              }
              return result
            },
          }),
        },
      }),
      UserRoles.init(),
      Session.init({
        override: {
          functions: (originalImplementation) => ({
            ...originalImplementation,
            createNewSession: async (input) => {
              const roles = await UserRoles.getRolesForUser(input.tenantId, input.userId)
              input.accessTokenPayload = {
                ...input.accessTokenPayload,
                roles: roles.status === 'OK' ? roles.roles : [],
              }
              return originalImplementation.createNewSession(input)
            },
          }),
        },
      }),
    ],
  })
}

/**
 * Creates role definitions and backfills roles for existing users
 * First user gets admin role, others get viewer role
 */
export async function seedRoles() {
  for (const role of Object.values(ROLES)) {
    await UserRoles.createNewRoleOrAddPermissions(role, [])
  }

  // Assign admin to existing users who have no role (pre-roles migration)
  const { users } = await supertokens.getUsersOldestFirst({ tenantId: 'public', limit: 500 })
  for (const user of users) {
    const rolesRes = await UserRoles.getRolesForUser('public', user.id)
    if (rolesRes.status === 'OK' && rolesRes.roles.length === 0) {
      const role = users.indexOf(user) === 0 ? ROLES.ADMIN : ROLES.VIEWER
      await UserRoles.addRoleToUser('public', user.id, role)
      console.log(`Backfilled role "${role}" for user ${user.emails[0] ?? user.id}`)
    }
  }
}

/**
 * Assigns default role to a new user
 * First user becomes admin, subsequent users become viewers
 */
async function assignDefaultRole(userId: string) {
  const users = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit: 2 })
  const isFirstUser = users.users.length <= 1
  const role = isFirstUser ? ROLES.ADMIN : ROLES.VIEWER
  await UserRoles.addRoleToUser('public', userId, role)
  console.log(`Assigned role "${role}" to user ${userId}`)
}

/**
 * Creates an initial admin user from environment variables if configured
 * Validates email domain and upgrades existing users to admin if needed
 */
export async function createInitialAdmin() {
  if (!config.supertokens.adminEmail || !config.supertokens.adminPassword) {
    console.log('No ADMIN_EMAIL/ADMIN_PASSWORD configured, skipping initial admin creation')
    return
  }

  const email = config.supertokens.adminEmail
  const password = config.supertokens.adminPassword

  if (config.supertokens.allowedEmailDomain) {
    if (!email.includes('@')) {
      console.error(`Invalid admin email format: ${email}`)
      return
    }
    const domain = email.split('@')[1]
    if (domain !== config.supertokens.allowedEmailDomain) {
      console.error(
        `Admin email domain (@${domain}) does not match allowed domain (@${config.supertokens.allowedEmailDomain})`,
      )
      return
    }
  }

  try {
    const existingUsers = await supertokens.listUsersByAccountInfo('public', { email })
    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0]
      console.log(`Admin user ${email} already exists`)
      const rolesRes = await UserRoles.getRolesForUser('public', existingUser.id)
      if (rolesRes.status === 'OK' && !rolesRes.roles.includes(ROLES.ADMIN)) {
        await UserRoles.addRoleToUser('public', existingUser.id, ROLES.ADMIN)
        console.log(`Added admin role to existing user ${email}`)
      }
      return
    }

    const result = await EmailPassword.signUp('public', email, password)
    if (result.status === 'OK') {
      await UserRoles.addRoleToUser('public', result.user.id, ROLES.ADMIN)
      console.log(`Created initial admin user: ${email}`)
    } else {
      console.error(`Failed to create admin user: ${result.status}`)
    }
  } catch (err) {
    console.error('Error creating initial admin user:', err)
  }
}
