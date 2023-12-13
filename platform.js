const RingCentral = require('@ringcentral/sdk').SDK
const pgdb = require('./db')
require('dotenv').load()


function RCPlatform(id) {
  this.extensionId = id

  var cachePrefix = `user_${id}`
  var rcsdk = new RingCentral({
        cachePrefix: cachePrefix,
        server: RingCentral.server.production,
        clientId: process.env.CLIENT_ID_PROD,
        clientSecret:process.env.CLIENT_SECRET_PROD,
        redirectUri: process.env.RC_APP_REDIRECT_URL,
      })

  this.platform = rcsdk.platform()

  this.platform.on(this.platform.events.loginSuccess, this.loginSuccess)
  this.platform.on(this.platform.events.logoutSuccess, this.logoutSuccess)
  this.platform.on(this.platform.events.refreshError, this.refreshError)

  var boundFunction = ( async function() {
      console.log("WONDERFUL", this.extensionId)
      var tokenObj = await this.platform.auth().data()
      //this.token_json = tokenObj
      this.updateUserAccessTokens(JSON.stringify(tokenObj))
  }).bind(this);
  this.platform.on(this.platform.events.refreshSuccess, boundFunction);
  this.autoRefreshTimer = undefined
  return this
}

RCPlatform.prototype = {
  login: async function(code){
    try{
      var resp = await this.platform.login({
      code: code,
      redirectUri: process.env.RC_APP_REDIRECT_URL
      })

      var tokenObj = await this.platform.auth().data()
      //this.token_json = tokenObj
      this.extensionId = tokenObj.owner_id
      this.updateUserAccessTokens(JSON.stringify(tokenObj))
      return this.extensionId
    }catch(e) {
      console.log('PLATFORM LOGIN ERROR ' + e.message || 'Server cannot authorize user');
      return null
    }
  },
  logout: function(){
    this.platform.logout()
  },
  setAccessToken: async function(tokens){
    await this.platform.auth().setData(tokens)
    return await this.platform.loggedIn()
  },
  getAccessToken: async function(extId){
    if (extId  !=  this.extensionId){
      console.log (`requester: ${extId}  !=  owner: ${this.extensionId}`)
      console.log("If this ever happens => SERIOUS PROBLEM. Need to check and fix!")
      return ""
    }
    //console.log(this.token_json)
    //await this.platform.auth().setData(this.token_json)
    let loggedIn = await this.platform.loggedIn()
    if (loggedIn){
      let tokens = await this.platform.auth().data()
      return tokens.access_token
    }else{
      console.log("BOTH TOKEN TOKENS EXPIRED")
      console.log("CAN'T REFRESH")
      //console.log("FROM this", this.token_json)
      var check = await this.platform.auth().data()
      console.log("FROM PLATFORM", check)
      return ""
    }
  },
  getPlatform: async function(extId){
    if (extId  !=  this.extensionId){
      console.log (`requester: ${extId}  !=  owner: ${this.extensionId}`)
      console.log("If this ever happens => SERIOUS PROBLEM. Need to check and fix!")
      return null
    }
    //await this.platform.auth().setData(this.token_json)
    if (await this.platform.loggedIn()){
      return this.platform
    }else{
      console.log("BOTH TOKEN TOKENS EXPIRED")
      console.log("CAN'T REFRESH")
      //console.log("FROM this", this.token_json)
      var check = await this.platform.auth().data()
      console.log("FROM PLATFORM", check)
      return null
    }
  },
  getSDKPlatform: function(){
    return this.platform
  },
  updateUserAccessTokens: async function(tokenStr) {
    console.log("updateUserAccessTokens")
    var query = `UPDATE rcai_users SET tokens='${tokenStr}' WHERE ext_id=${this.extensionId}`
    var result = await pgdb.updateAsync(query)
    if (!result){
        console.error("Add user tokens to ai_subscriptionids failed");
    }else{
        console.log("updateUserAccessTokens DONE");
    }
  },
  loginSuccess: function(e){
    console.log("Login success")
  },
  logoutSuccess: function(e){
    console.log("logout Success")
  },
  refreshError: function(e){
    console.log("refresh Error")
    console.log("Error " + e.message)
  }
}

module.exports = RCPlatform;
