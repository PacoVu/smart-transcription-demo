const pgdb = require('./db')
const RCAIEngine = require('./ringcentral-ai.js');
const RCPlatform = require('./platform.js')

require('dotenv').load()

const ONE_DAY_TIMER_INTERVAL = 86400000

function BgEngine(params) {
  this.params = params
  this.enrolledSpeakerIds = []
  this.rc_platform = new RCPlatform(params.extensionId)
  this.aiEngine = undefined
  return this
}

BgEngine.prototype = {
  getUserTable: function(){
    return "rcai_user_" + this.params.extensionId
  },
  readAccountEnrolledSpeakerIds: async function(){
      await this._readAccountEnrolledSpeakerIds(1)
  },
  _readAccountEnrolledSpeakerIds: async function(page){
    var p = await this.rc_platform.getPlatform(this.params.extensionId)
    if (p){
      try{
        let queryParams = {
            partial: false,
            perPage: 100,
            page: page
        }
        let endpoint = "/ai/audio/v1/enrollments"
        var resp = await p.get(endpoint, queryParams)
        var jsonObj = await resp.json()
        for (var enrollment of jsonObj.records){
          //this.enrolledSpeakerIds.push(enrollment.speakerId)
          if (enrollment.hasOwnProperty('enrollmentId'))
            this.enrolledSpeakerIds.push(enrollment.enrollmentId)
          else
            this.enrolledSpeakerIds.push(enrollment.speakerId)
        }
        if (jsonObj.paging.page < jsonObj.paging.totalPages){
          let page = jsonObj.paging.page + 1
          await this._readAccountEnrolledSpeakerIds(p, page)
        }
        //console.log(this.enrolledSpeakerIds)
      }catch (e){
        console.log("Unable to read speakers identification.", e.message)
      }
    }
  },
  handleAutoTranscription: async function() {
    let loggedIn = await this.rc_platform.setAccessToken(this.params.tokens)
    if (loggedIn){
      var p = await this.rc_platform.getPlatform(this.params.extensionId)
      if (p){
        // read call log
        let endpoint = "/restapi/v1.0/account/~/extension/~/call-log";
        let params = {
          view: "Simple",
          telephonySessionId: this.params.telSessionId
        }
        try{
          var resp = await p.get(endpoint, params)
          var jsonObj = await resp.json()
          //console.log("RESPONSE: " + JSON.stringify(json))
          if (jsonObj.records.length > 0){
            let record = jsonObj.records[0]
            if (!record.hasOwnProperty('recording')){
              console.log(record.id + " Has no recording")
            }else{
              // CR and VM has the same 'from' and 'to' data structure
              var fromObj = {
                name: "",
                phone_number: "",
                extension_id: ""
              }
              var toObj = {
                name: "",
                phone_number: "",
                extension_id: ""
              }
              if (record.hasOwnProperty('to')){
                if (record.to.hasOwnProperty('phoneNumber'))
                  toObj.phone_number = record.to.phoneNumber
                else if (record.to.hasOwnProperty('extensionNumber'))
                  toObj.phone_number = `${this.params.mainCompanyPhoneNumber}*${record.to.extensionNumber}`
                else
                  toObj.phone_number = "Unknown #"
                if (record.to.hasOwnProperty('name'))
                  toObj.name = record.to.name
                else
                  toObj.name = "Unknown"

                if (record.to.hasOwnProperty('extensionId'))
                  toObj.extension_id = record.to.extensionId
                else{ // detect extension id???
                  console.log("no extension id")
                }
              }else{
                toObj.phone_number = "Unknown #"
                toObj.name = "Unknown"
              }


              if (record.hasOwnProperty('from')){
                if (record.from.hasOwnProperty('phoneNumber'))
                  fromObj.phone_number = record.from.phoneNumber
                else if (record.from.hasOwnProperty('extensionNumber'))
                  fromObj.phone_number = `${this.params.mainCompanyPhoneNumber}*${record.from.extensionNumber}`
                else
                  fromObj.phone_number = "Unknown #"
                if (record.from.hasOwnProperty('name'))
                  fromObj.name = record.from.name
                else
                  fromObj.name = "Unknown"

                if (record.from.hasOwnProperty('extensionId'))
                  fromObj.extension_id = record.from.extensionId
                else{ // detect extension id???
                  console.log("no extension id")
                }
              }else{
                fromObj.phone_number = "Unknown #"
                fromObj.name = "Unknown"
              }

              var host = (record.direction == "Outbound") ? fromObj : toObj
              var participants = (record.direction == "Outbound") ? [toObj] : [fromObj]
              /*
              var participants = [
                host,
                (record.direction == "Outbound") ? toObj : fromObj
                ]
              */
              console.log("Participants:", participants)
              var item = {
                call_type: "CR",
                uid: record.recording.id,
                recording_url: record.recording.contentUri,
                call_date: new Date(record.startTime).getTime(), //  - (8*3600*1000)
                rec_id: record.id,
                duration: record.duration,
                direction: (record.direction == "Inbound") ? "In" : "Out"
              }

              query = `INSERT INTO ${this.getUserTable()}`
              query += " (uid, rec_id, call_date, call_type, host, participants, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, conversational_insights, utterance_insights, speaker_insights, subject, speakers)"
              query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)"
              var values = [item.uid, item.rec_id,item.call_date,item.call_type,JSON.stringify(host),JSON.stringify(participants),item.recording_url,item.duration,item.direction,2,'[]',"",'[]','{}','[]','{}',"N/A",'[]']
              query += " ON CONFLICT DO NOTHING"
              var response = await pgdb.insertAsync(query, values)
              if (response){
                console.log("get account enrolled speaker ids")
                await this.readAccountEnrolledSpeakerIds()
                /*
                var speakerIdIndex = this.enrolledSpeakerIds.indexOf(this.params.extensionId)
                var speakerIds = []
                if (speakerIdIndex >= 0)
                  speakerIds.push(this.enrolledSpeakerIds[speakerIdIndex])
                */
                //var speakerIds = this.enrolledSpeakerIds
                var accessToken = await this.rc_platform.getAccessToken(this.params.extensionId) // generate valid tokens
                if (accessToken != ""){
                  var recordingInfo = {
                    uid: item.uid,
                    type: item.call_type,
                    contentUri: `${item.recording_url}?access_token=${accessToken}`,
                    speakerIds: this.enrolledSpeakerIds, //speakerIds,
                    speakerCount: 3
                  }
                  //let userTable = this.getUserTable() // `ai_user_${this.params.extensionId}`
                  this.aiEngine = new RCAIEngine(this.rc_platform, this.params.extensionId, this.params.userName)
                  await this.aiEngine.transcribe(recordingInfo)
                }
              }else{
                console.log("Cannot insert db?")
              }
            }
          }
        }catch (e){
          console.log(e.message)
        }
      }
    }
  },
  handleManualTranscription: async function(req, res){
    console.log("handleManualTranscription")
    let loggedIn = await this.rc_platform.setAccessToken(this.params.tokens)
    if (!loggedIn){
      res.send({status:'failed', message:'Your session expired. Please relogin'})
      return
    }
    ///
    //var enrollmentIdIndex = this.enrolledSpeakerIds.indexOf(this.extensionId)
    var speakerIds = []
    //if (enrollmentIdIndex >= 0)
    //  enrollmentIds.push(this.enrolledSpeakerIds[enrollmentIdIndex])

    // read the recording info from db
    var query = `SELECT host, participants FROM ${this.getUserTable()} WHERE uid=${req.body.uid}`
    var speakerCount = 2
    var result = await pgdb.readAsync(query)
    if (result && result.rows.length > 0){
      await this.readAccountEnrolledSpeakerIds()
      //var speakerIdIndex = this.enrolledSpeakerIds.indexOf(this.params.extensionId)
      var item = result.rows[0]
      if (req.body.type == 'ULV' || req.body.type == "ULC"){ // Upload content
        // no speaker ids for unknown participants from upload content
        /*
        speakerIds = []
        speakerCount = result.rows[0].participants.length
        for (var item of result.rows[0].participants){
          var speakerIdIndex = this.enrolledSpeakerIds.indexOf(item.extension_id)
          if (speakerIdIndex >= 0)
            speakerIds.push(this.enrolledSpeakerIds[speakerIdIndex])
        }
        */
        speakerCount = 0
      }else{
        speakerIds = this.enrolledSpeakerIds
        /*
        if (req.body.type == 'CR'){ // RCV Voice calls
          //speakerIds.push(result.rows[0].host.extension_id)
          //speakerIds = this.enrolledSpeakerIds
          //speakerCount = 3 // Default to 3 speakers to include the operator speaker
        }else{ // RCV meetings
          //if (result.rows[0].host.extension_id != this.extensionId){
          //  enrollmentIds.push(result.rows[0].host.extension_id)
          //}
          speakerCount = result.rows[0].participants.length
          for (var item of result.rows[0].participants){
            var speakerIdIndex = this.enrolledSpeakerIds.indexOf(item.extension_id)
            //if (enrollmentIdIndex >= 0 && item.extension_id != this.extensionId)
            if (speakerIdIndex >= 0){
              let found = speakerIds.indexOf(item.extension_id)
              if (found < 0)
                speakerIds.push(this.enrolledSpeakerIds[speakerIdIndex])
            }
          }
        }
        */
      }
    }
    console.log("speakerIds:", speakerIds)

    var accessToken = await this.rc_platform.getAccessToken(this.params.extensionId) // generate valid tokens
    if (accessToken != ""){
      var recordingInfo = {
        uid: req.body.uid,
        type: req.body.type,
        contentUri: `${req.body.recordingUrl}?access_token=${accessToken}`,
        speakerIds: this.enrolledSpeakerIds //speakerIds,
        //speakerCount: speakerCount
      }
      if (req.body.type == "CR")
        recordingInfo['speakerCount'] = 3
      this.aiEngine = new RCAIEngine(this.rc_platform, this.params.extensionId, this.params.userName)
      var response = await this.aiEngine.transcribe(recordingInfo)
      res.send(JSON.stringify(response))
    }else{
      res.send({status:'failed', message:'Your session expired. Please relogin'})
    }
  },
  parseTranscription: async function(uid, audioSrc, jsonObj){
    console.log(" bg-engine: parseTranscription")
    console.log(JSON.stringify(jsonObj))
    // First read the record host and participants to get their names
    var query = `SELECT host, participants, call_type FROM ${this.getUserTable()} WHERE uid='${uid}'`

    var result = await pgdb.readAsync(query)
    //var hostObj = undefined
    var participantsObj = []
    var callType = ""
    if (result && result.rows.length > 0){
      participantsObj = result.rows[0].participants
      callType = result.rows[0].call_type
      let found = participantsObj.find(o => o.extension_id == result.rows[0].host.extension_id)
      if (!found) // Video call has host info in the participants object. Voice call does not have this!
        participantsObj.push(result.rows[0].host)
    }
    console.log("participantsObj:", participantsObj)
    var transcript = ""
    var conversations = []
    var wordsandoffsets = []
    var utteranceInsights = [] //jsonObj.utteranceInsights
    var speakerSentence = {
      sentence: [],
      timestamp: [],
      speakerId: ""
    }
    var speakers = []
    let speakerCount = jsonObj.speakerInsights.speakerCount

    if (jsonObj.utteranceInsights.length){
      var speakerId = jsonObj.utteranceInsights[0].speakerId
      console.log("speakerId", speakerId)
      speakerSentence.speakerId = speakerId
      console.log("speakerSentence.speakerId", speakerSentence.speakerId)
      for (var utterance of jsonObj.utteranceInsights){
        if (utterance.text.length){
          if (speakerId != utterance.speakerId){ // speaker sentence // speaker change
            speakerSentence.speakerId = speakerId
            conversations.push(speakerSentence)
            // reset to make new sentence
            var speakerSentence = {
              sentence: [],
              timestamp: [],
              speakerId: utterance.speakerId
            }
            speakerId = utterance.speakerId
          }

          for (var item of utterance.wordTimings){
            var wordoffset = {
              word: item.word,
              offset: item.start
            }
            wordsandoffsets.push(wordoffset)
            speakerSentence.timestamp.push(item.start)
            speakerSentence.sentence.push(item.word)
          }
          transcript += utterance.text + " "
          var utt = {
            start: utterance.start,
            text: utterance.text,
            speakerId: utterance.speakerId,
            insights: utterance.insights
          }
          utteranceInsights.push(utt)
          // Detect speakers name
          if (speakers.length == 0){
            var speakerName = this._identifySpeakers(speakers, speakerCount, callType, participantsObj, utterance.speakerId, utterance.text.toLowerCase())
            var speaker = {
              id: utterance.speakerId,
              name: speakerName
            }
            speakers.push(speaker)
          }else if (!speakers.find(o => o.id == utterance.speakerId)){
            var speakerName = this._identifySpeakers(speakers, speakerCount, callType, participantsObj, utterance.speakerId, utterance.text.toLowerCase())
            var speaker = {
              id: utterance.speakerId,
              name: speakerName
            }
            speakers.push(speaker)
          }
        }
      }
    }
    //console.log(utteranceInsights)
    // push the last speaker sentence
    conversations.push(speakerSentence)
    /*
    console.log("===== transcript =====")
    console.log(transcript)
    */
    //console.log("===== conversations =====")
    //console.log(conversations)

    var conversationalInsights = {
        keyPhrases: [],
        extractiveSummary: [],
        topics: [],
        tasks: [],
        longAbstract: [],
        shortAbstract: [],
        overallSentiment: [],
        qiQa: [],
        objectionScore: [],
        callScore: []
      }

    for (var insight of jsonObj.conversationalInsights){
      switch (insight.name){
        case "KeyPhrases":
          for (var item of insight.values){
            var obj = conversationalInsights.keyPhrases.find(o => o.keyPhrase == item.value)
            if (!obj){
              var kwObj = {
                keyPhrase: item.value,
                start: item.start,
                occurrence: 1
              }
              conversationalInsights.keyPhrases.push(kwObj)
            }else{
              obj.occurrence++
            }
          }
          break
        case "ExtractiveSummary":
          for (var item of insight.values){
            var summary = {
              sentence: item.value,
              start: item.start,
              end: item.end
            }
            conversationalInsights.extractiveSummary.push(summary)
          }
          break
        case "Topics":
          for (var item of insight.values){
            var topic = {
              topic: item.value,
              start: item.start,
              end: item.end
            }
            conversationalInsights.topics.push(topic)
          }
          break
        case "Tasks":
          for (var item of insight.values){
            conversationalInsights.tasks.push(item.value)
          }
          break
        case "AbstractiveSummaryLong":
          for (var item of insight.values){
            var longAbs = {
              text: item.value,
              start: item.start,
              end: item.end
            }
            conversationalInsights.longAbstract.push(longAbs)
          }
          break
        case "AbstractiveSummaryShort":
          for (var item of insight.values){
            var shortAbs = {
              text: item.value,
              start: item.start,
              end: item.end
            }
            conversationalInsights.shortAbstract.push(shortAbs)
          }
          break
        case "OverallSentiment":
          for (var value of insight.values){
            conversationalInsights.overallSentiment.push(value)
          }
          break
        case "QiQa":
        for (var item of insight.values){
          var value = {
            start: item.start,
            end: item.end,
            question: item.question,
            answer: item.answer,
            speakerId: item.speakerId,
            confidence: item.confidence
          }
          conversationalInsights.overallSentiment.push(value)
        }
          break
        case "ObjectionScore":
          for (var value of insight.values){
            conversationalInsights.qiQa.push(value)
          }
          break
        case "CallScore":
          for (var value of insight.values){
            conversationalInsights.callScore.push(value)
          }
          break
        default:
          break
      }
    }

    //console.log(conversationalInsights)
    var speakerInsights = {
      energy: [],
      talkToListenRatio: [],
      questionsAsked: [],
      interruptions: [],
      tone: [],
      pace: [],
      talkTime: [],
      talkingSpeed: [],
      fillerWordRate: [],
      longestMonologue: [],
      patience: []
    }

    for (var insight of jsonObj.speakerInsights.insights){
      switch (insight.name){
        case "Energy":
          for (var item of insight.values){
            speakerInsights.energy.push(item)
            /*
            var speaker = {
              id: item.speakerId,
              name: this._getSpeakerName(item.speakerId) // `Speaker ${item.speakerId}`
            }
            speakers.push(speaker)
            */
          }
          break
        case "TalkToListenRatio":
          for (var item of insight.values){
            speakerInsights.talkToListenRatio.push(item)
          }
          break
        case "QuestionsAsked":
          for (var item of insight.values){
            speakerInsights.questionsAsked.push(item)
          }
          break
        case "Interruptions":
          for (var item of insight.values){
            speakerInsights.interruptions.push(item)
          }
          break
        case "Tone":
          for (var item of insight.values){
            speakerInsights.tone.push(item)
          }
          break
        case "Pace":
          for (var item of insight.values){
            speakerInsights.pace.push(item)
          }
          break
        case "TalkTime":
          for (var item of insight.values){
            speakerInsights.talkTime.push(item)
          }
          break
        case "TalkingSpeed":
          for (var item of insight.values){
            speakerInsights.talkingSpeed.push(item)
          }
          break
        case "FillerWordRate":
          for (var item of insight.values){
            speakerInsights.fillerWordRate.push(item)
          }
          break
        case "LongestMonologue":
          for (var item of insight.values){
            speakerInsights.longestMonologue.push(item)
          }
          break
        case "Patience":
          for (var item of insight.values){
            speakerInsights.patience.push(item)
          }
          break
        default:
          break
      }
    }
    //if (callType == "CR"){
      var subject = (conversationalInsights.shortAbstract.length > 0) ? conversationalInsights.shortAbstract[0].text : "N/A"
      var reExp = new RegExp("'","g")
      subject = subject.replace(reExp, "''")
    //}
    // clean up and escape single quote, apos

    transcript = transcript.trim().replace(reExp, "''")
    var wno =  JSON.stringify(wordsandoffsets)
    wno = wno.replace(reExp, "''")
    var convo = JSON.stringify(conversations)
    convo = convo.replace(reExp, "''")

    conversationalInsights = JSON.stringify(conversationalInsights)

    conversationalInsights = conversationalInsights.replace(reExp, "''")
    speakerInsights = JSON.stringify(speakerInsights)
    speakerInsights = speakerInsights.replace(reExp, "''")
    utteranceInsights = JSON.stringify(utteranceInsights)
    utteranceInsights = utteranceInsights.replace(reExp, "''")


    var query = `UPDATE ${this.getUserTable()} SET processed=1`
    query += `, wordsandoffsets='${wno}'`
    query += `, transcript='${transcript}'`
    query += `, conversations='${convo}'`
    query += `, conversational_insights='${conversationalInsights}'`
    query += `, utterance_insights='${utteranceInsights}'`
    query += `, speaker_insights='${speakerInsights}'`
    if (callType == "CR")
      query += `, subject='${subject}'`
    query += `, speakers='${JSON.stringify(speakers)}'`
    query += ` WHERE uid=${uid}`
    //console.log(query)
    var response = await pgdb.updateAsync(query)
    if (!response){
      console.error("Failed update data");
    }else{
      console.error("TRANSCRIPT UPDATE DB OK");
    }
  },
  /*
  _identifySpeaker: function(speakerId){
      if (speakerId === this.params.extensionId){
        return this.userName
      }else{
        return speakerId //`Speaker ${speakerId}`
      }
  },
  */
  _identifySpeakers: function(speakers, speakerCount, callType, participantsObj, speakerId, text){
    console.log(speakerCount, " / ", participantsObj.length, ' / ', speakerId)
    var participant = participantsObj.find(o => o.extension_id === speakerId)
    console.log("participant", participant)
    if (participant){
      return participant.name
    }else if (callType == "CR"){
      if (speakerCount > 2){ // Detect RingCentral operator's speaker
        if (  speakerId == '0' && // only if first speaker is speaker 0!!!
              (text.indexOf("this call is being recorded") >= 0 ||
               text.indexOf("if you do not wish to be recorded please disconnect at this time.") >= 0 ||
               text.indexOf("please disconnect at this time") >= 0) ){
          return "Operator"
        }
      }
    }
    return `Speaker ${speakerId}`
  },
  _identifySpeakers_noneed: function(speakers, speakerCount, callType, participantsObj, speakerId, text){
    console.log(speakerCount, " / ", participantsObj.length, ' / ', speakerId)
    var participant = participantsObj.find(o => o.extension_id === speakerId)
    console.log("participant", participant)
    if (participant){
      return participant.name
    }else if (callType == "CR"){
      if (speakerCount > 2){
        /*
        var found = speakers.find(o => o.id == speakerId)
        if (found){ // found 1 identified speaker => check and return the name of the other one
          //console.log("One of the call participants. Detect if already assigned")
          console.log("found identified speaker", found)
          return found.name
        }
        */
        if (  speakerId == '0' && // only if first speaker is speaker 0!!!
              (text.indexOf("this call is being recorded") >= 0 ||
               text.indexOf("if you do not wish to be recorded please disconnect at this time.") >= 0 ||
               text.indexOf("please disconnect at this time") >= 0) ){
          return "Operator"
        }else{
          return `Speaker ${speakerId}`
          /*
          console.log("One of the call participants. Detect if already assigned")
          var found = speakers.find(o => o.id == speakerId)
          console.log(found)
          if (found){ // found 1 identified speaker => check and return the name of the other one
            return found.name
          }else{
            console.log("Not yet assigned", speakers, speakerId)
            for (var p of participantsObj){
              console.log("p", p)
              if (p.extension_id == speakerId){
                return p.name
              }
            }
            return `Speaker ${speakerId}`
          }
          */
        }
      }else if (speakerCount == 2){ // 2 speakers
        console.log("2 speakers, 2 participants?", participantsObj.length)
        //if (participantsObj.length == 2){
          var found = speakers.find(o => o.id == speakerId)
          if (found){ // found 1 identified speaker => check and return the name of the other one
            return found.name
          }else{
            console.log("No identified speaker or not yet identified", speakers, speakerId)
            for (var p of participantsObj){
              console.log("p", p)
              if (p.extension_id == speakerId){
                return p.name
                //var assigned = speakers.find(s => s.name == p.name)
                //return (!assigned) ? p.name : `Speaker ${speakerId}`
              }
            }
            return `Speaker ${speakerId}`
          }
        //}
      }else{
        console.log("Why only 1 speaker?")
        return `Speaker ${speakerId}`
      }
    }else{ // Meetings, Demo media
      console.log("Detect meetings, demo media speakers")
      /*
      if (speakerCount == 2 && participantsObj.length == 2){
        var found = speakers.find(o => o.id == speakerId)
        if (found){ // found 1 identified speaker => check and return the name of the other one
          return found.name
        }else{
          console.log("Why:", speakers, speakerId)
          for (var p of participantsObj){
            console.log("p", p)
            if (p.extension_id == ''){
              var assigned = speakers.find(s => s.name == p.name)
              var name = p.name
              if (assigned)
                name = `Speaker ${speakerId}`
              return name
              //return (p.name != '') ? p.name : `Speaker ${speakerId}`
            }
          }
        }
      }else if (speakerCount == 3 && participantsObj.length == 2){
      */
        for (var p of participantsObj){
          console.log("p", p)
          if (p.extension_id == speakerId){
            return p.name
          }
        }
        return `Speaker ${speakerId}`
      //}
      //console.log("Return end")
      //return `Speaker ${speakerId}`
    }
  },
  _identifySpeakers_old: function(speakers, speakerCount, callType, participantsObj, speakerId, text){
    console.log(speakerCount, " / ", participantsObj.length, ' / ', speakerId)
    var participant = participantsObj.find(o => o.extension_id === speakerId)
    console.log("participant", participant)
    if (participant){
      return participant.name
    }else if (callType == "CR" && speakerCount > 2){
      if (  speakerId == '0' || // only if first speaker is speaker 0!!!
            text.indexOf("this call is being recorded") >= 0 ||
            text.indexOf("if you do not wish to be recorded please disconnect at this time.") >= 0 ||
            text.indexOf("please disconnect at this time") >= 0 ){
        return "Operator"
      }else{
        console.log("One of the call participants. Detect if already assigned")
        var found = speakers.find(o => o.id == speakerId)
        console.log(found)
        if (found){ // found 1 identified speaker => check and return the name of the other one
          return found.name
        }else{
          console.log("Not yet assigned", speakers, speakerId)
          if (callType == "CR"){
            for (var p of participantsObj){
              console.log("p", p)
              if (p.extension_id == ''){
                var assigned = speakers.find(s => s.name == p.name)
                //var name = p.name
                //if (assigned)
                //  name = `Speaker ${speakerId}`
                //return name
                return (assigned) ? p.name : `Speaker ${speakerId}`
              }
            }
          }
          /*
          var check = participantsObj.findIndex(o => o.extension_id == speakerId)
          var index = (check == 0) ? 1 : 0
          console.log("index", index)
          return participantsObj[index].name
          */
        }
      }
    }else{
      console.log("Last else?")
      if (speakerCount == 2 && participantsObj.length == 2){
        var found = speakers.find(o => o.id == speakerId)
        if (found){ // found 1 identified speaker => check and return the name of the other one
          return found.name
        }else{
          console.log("Why:", speakers, speakerId)
          for (var p of participantsObj){
            console.log("p", p)
            if (p.extension_id == ''){
              var assigned = speakers.find(s => s.name == p.name)
              var name = p.name
              if (assigned)
                name = `Speaker ${speakerId}`
              return name
              //return (p.name != '') ? p.name : `Speaker ${speakerId}`
            }
          }
        }
      }else if (speakerCount == 3 && participantsObj.length == 2){
        console.log("this else 2222")
        if (callType == "CR"){
          for (var p of participantsObj){
            console.log("p", p)
            if (p.extension_id == ''){
              var assigned = speakers.find(s => s.name == p.name)
              var name = p.name
              if (assigned)
                name = `Speaker ${speakerId}`
              return name
              //return (p.name != '') ? p.name : `Speaker ${speakerId}`
            }
          }
        }
      }
      console.log("Return end")
      return `Speaker ${speakerId}`
    }
  },
  _getSpeakerName: function(speakerId){
      if (speakerId === this.params.extensionId){
        return this.userName
      }else{
        return `Speaker ${speakerId}`
      }
  }
}

module.exports = BgEngine;
