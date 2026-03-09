import supertokens from 'supertokens-node'
import Session from 'supertokens-node/recipe/session/index.js'
import ThirdParty from 'supertokens-node/recipe/thirdparty/index.js'
import UserRoles from 'supertokens-node/recipe/userroles/index.js'
import { config } from './config.js'

export const ROLES = { ADMIN: 'admin', EDITOR: 'editor', VIEWER: 'viewer' } as const
export type AppRole = (typeof ROLES)[keyof typeof ROLES]

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

async function assignDefaultRole(userId: string) {
  const users = await supertokens.getUsersNewestFirst({ tenantId: 'public', limit: 2 })
  const isFirstUser = users.users.length <= 1
  const role = isFirstUser ? ROLES.ADMIN : ROLES.VIEWER
  await UserRoles.addRoleToUser('public', userId, role)
  console.log(`Assigned role "${role}" to user ${userId}`)
}
