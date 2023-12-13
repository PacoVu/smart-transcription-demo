const User = require('./usershandler.js')
require('dotenv').load()
const request = require('request');
let RingCentral = require('@ringcentral/sdk').SDK
const pgdb = require('./db')
var users = []


function getUserIndex(id){
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (user != null){
      if (id == user.getUserId()){
        return i
      }
    }
  }
  return -1
}
/*
function getUserIndexByExtensionId(extId){
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (extId == user.getExtensionId()){
      return i
    }
  }
  return -1
}
*/
var router = module.exports = {
  loadLogin: async function(req, res){
    if (req.session.userId == 0) {
      var id = new Date().getTime()
      req.session.userId = id;
      var rcsdk = new RingCentral({
            server: RingCentral.server.production,
            clientId: process.env.CLIENT_ID_PROD,
            clientSecret:process.env.CLIENT_SECRET_PROD,
            redirectUri: process.env.RC_APP_REDIRECT_URL,
          })

      var platform = rcsdk.platform()
      res.render('login', {
          authorize_uri: platform.loginUrl({ // authUrl
            brandId: process.env.RINGCENTRAL_BRAND_ID,
            redirectUri: process.env.RC_APP_REDIRECT_URL
          }),
          redirect_uri: process.env.RC_APP_REDIRECT_URL
      });
    }else{
      console.log("Reload page")
      var index = getUserIndex(req.session.userId)
      if (index >= 0)
        users[index].loadReadLogPage(req, res)
      else{
        this.forceLogin(req, res)
      }
    }
  },
  forceLogin: function(req, res){
    req.session.destroy();
    res.render('index')
  },
  login: function(req, res){
    if (!req.session.userId)
      return this.forceLogin(req, res)

    var user = new User(req.session.userId)
    user.login(req, res, function(err, extensionId){
      if (!err){
        console.log("Login successfully")
        users.push(user)
      }else{
        console.log("Unauthorized user => Do not add to users list")
      }
    })
  },
  logout: async function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0){
      return this.forceLogin(req, res)
    }
    await users[index].logout(req, res)
    users[index] = null
    users.splice(index, 1);
    this.forceLogin(req, res)
  },
  subscribeForNotification: function (req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].subscribeForNotification(req, res)
  },
  removeSubscription: function(req, res) {
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].removeSubscription(res)
  },
  handleWebhooksPost: function(jsonObj){
    if (jsonObj.event.indexOf('telephony/sessions') > 0){
      var party = jsonObj.body.parties[0]
      if (party.extensionId){
        if (party.status.code == "Disconnected"){
          if (party.hasOwnProperty('recordings')){
            console.log("Has recording => set 60 secs delay and read the call log")
            detectSubcribedUser(jsonObj.body)
          }else{
            console.log("No call recording")
          }
        }
      }
    }
  },
  handleRCAICallback: async function(jsonObj){
    var query = `SELECT * FROM inprogressed_transcription WHERE transcript_id='${jsonObj.jobId}'`
    var result = await pgdb.readAsync(query)
    if (!result){
        console.log("no transcript_id found")
    }else if (result.rows.length == 1){
        let tempData = result.rows[0]
        var query = `DELETE FROM inprogressed_transcription WHERE transcript_id='${tempData.transcript_id}'`
        result = await pgdb.removeAsync(query)
        if (!result){
          console.error("Cannot remove item from inprogressed_transcription");
        }else
          console.log(`DELETE ${tempData.transcript_id} item from inprogressed_transcription`);

        if (jsonObj.status == "Success") {
          handleBackgroudProcess(tempData, jsonObj.response)
        }else{
          console.log("Failed", jsonObj)
          // delete pending inprogress transcription
          // update calllist item with processed to 0
          var query = `UPDATE  ai_user_${tempData.ext_id} SET processed=0 WHERE uid=${tempData.item_id}`
          result = await pgdb.updateAsync(query)
          if (!result){
            console.error("Update processed failed");
          }else{
            console.log("UPDATE processed flag successfully");
          }
        }
    }
  },
  startEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].startEnrollment(req, res)
  },
  readEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readEnrollment(req, res)
  },
  deleteEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].deleteEnrollment(res)
  },
  startEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].startEnrollment(req.file.path, res)
  },
  readEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readEnrollment(res)
  },
  deleteEnrollment: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].deleteEnrollment(res)
  },
  /*
  deleteItemFromDb: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].deleteItemFromDb(req, res)
  },
  deleteItemsFromDb: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].deleteItemsFromDb(req, res)
  },
  createRecord: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].createRecord(req, res)
  },
  */
  transcriptCallRecording: async function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    let extensionId = req.session.extensionId
    var query = `SELECT * FROM rcai_users WHERE ext_id=${extensionId}`
    var result = await pgdb.readAsync(query)
    if (result && result.rows.length == 1){
      let item = result.rows[0]
      if (item['tokens']){
        let params = {
          transcriptId: "",
          uid: "",
          audioSrc: "",
          extensionId: extensionId,
          userName: item['full_name'],
          mainCompanyPhoneNumber: item['main_company_number'],
          tokens: item['tokens']
        }
        var BgEngine = require('./background-engine.js')
        var user = new BgEngine(params)
        user.handleManualTranscription(req, res)
      }
    }else {
      console.log("query failed", query)
      res.send({status:'failed', message:'Your session expired. Please relogin'})
    }
  },
  saveNewSubject: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].saveNewSubject(req, res)
  },
  saveSpeakers: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].saveSpeakers(req, res)
  },
  saveFullName: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].saveNewFullName(req, res)
  },
  analyzeContent: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].analyzeContent(req, res)
  },
  proxyAudio: async function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)

    var accessToken = await users[index].getAccessToken()
    if (accessToken == ""){
      return this.forceLogin(req, res)
    }
    var url = req.query.url + `?access_token=${accessToken}`
    let remoteReq = request(url);
    req.on('close', function() {
        remoteReq.abort();
        res.end();
    });
    req.pipe(remoteReq).pipe(res);
  },
  readCallRecordingsAsync: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readCallRecordingsAsync(req.body, res)
  },
  readMeetingRecordingsAsync: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readMeetingRecordingsAsync(req, res)
  },
  findSimilar: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].findSimilar(req, res)
  },
  searchCallsFromDB: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].searchCallsFromDB(req, res)
  },
  loadCallsFromDB: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].loadCallsFromDB(req, res)
  },
  loadReadLogPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)

    req.session.extensionId = users[index].extensionId;
    users[index].loadReadLogPage(req, res)
  },
  loadEnrollmentPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)

    users[index].loadEnrollmentPage(req, res)
  },
  checkTranscriptionResult: async function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    var query = "SELECT processed FROM " + users[index].getUserTable() + " WHERE uid=" + req.query.uid;
    var result = await pgdb.readAsync(query)
    if (!result){
      res.send('{"status":"error"}')
      return console.error("Cannot read processed column?");
    }
    res.send('{"status":"ok","state":' + result.rows[0].processed + ',"uid":' + req.query.uid + '}')
  },
  cancelTranscriptionProcess: async function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    var query = "UPDATE " + users[index].getUserTable() + " SET processed=0 WHERE uid=" + req.query.uid;
    var result = await pgdb.updateAsync(query)
    if (!result){
        res.send('{"status":"error"}')
    }else{
      res.send('{"status":"ok","state":0,"uid":' + req.query.uid + '}')
    }
  }
}

async function detectSubcribedUser(body){
  var extensionId = body.parties[0].extensionId
  var query = `SELECT * FROM rcai_users WHERE ext_id=${extensionId}`
  var result = await pgdb.readAsync(query)
  if (result && result.rows.length == 1){
    let item = result.rows[0]
    if (item['sub_id'] != ""){
      let params = {
        telSessionId: body.telephonySessionId,
        extensionId: extensionId,
        userName: item['full_name'],
        mainCompanyPhoneNumber: item['main_company_number'],
        tokens: item['tokens']
      }
      setTimeout(function(){
        var BgEngine = require('./background-engine.js')
        var user = new BgEngine(params)
        user.handleAutoTranscription()
      }, 60000, params)
    }
  }
}

async function handleBackgroudProcess(tempData, response){
  var BgEngine = require('./background-engine.js')
  var query = `SELECT * FROM rcai_users WHERE ext_id=${tempData.ext_id}`
  var result = await pgdb.readAsync(query)
  if (result && result.rows.length == 1){
    let item = result.rows[0]
    if (item['tokens']){
      let params = {
        transcriptId: tempData.transcript_id,
        uid: tempData.item_id,
        audioSrc: tempData.audio_src,
        extensionId: tempData.ext_id,
        userName: item['full_name'],
        mainCompanyPhoneNumber: item['main_company_number'],
        tokens: item['tokens']
      }

      var user = new BgEngine(params)
      user.parseTranscription(params.uid, params.audioSrc, response)
    }
  }else {
    console.log("query failed", query)
  }
}
