import { createApp } from 'vue'
import { createPinia } from 'pinia'
import SuperTokens from 'supertokens-web-js'
import Session from 'supertokens-web-js/recipe/session'
import ThirdParty from 'supertokens-web-js/recipe/thirdparty'
import './style.css'
import App from './App.vue'
import router from './router'
import { config } from './config'

SuperTokens.init({
  appInfo: {
    apiDomain: config.apiDomain,
    apiBasePath: '/auth',
    appName: config.appName,
  },
  recipeList: [Session.init(), ThirdParty.init()],
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
