const pgdb = require('./db')

function RCAIEngine(rcPlatform, extensionId, userName) {
  this.rc_platform = rcPlatform
  this.extensionId = extensionId
  this.userName = userName
  //this.userRecordingTable = userRecordingTable
  console.log("userName", userName)
  return this
}
RCAIEngine.prototype = {
  transcribe: async function(recordingInfo) {
    //var data = null
    //var contentUri = recordingInfo.contentUri
    var audioType = "CallCenter"
    var encoding = "Mpeg"
    if (recordingInfo.type == "VR"){
      audioType = "Meeting"
      encoding = "Mp4"
    }
    var response = {
      status: "",
      message: "",
      uid: recordingInfo.uid
    }
    try{
      var params = {
          encoding: encoding,
          languageCode: "en-US",
          source: "RingCentral",
          audioType: audioType,
          separateSpeakerPerChannel: false,
          enableVoiceActivityDetection: true,
          enableWordTimings: true,
          contentUri: recordingInfo.contentUri,
          //speakerCount: recordingInfo.speakerCount,
          speakerIds: recordingInfo.speakerIds,
          insights: [ "All" ]
        }
      if (recordingInfo.hasOwnProperty("speakerCount"))
        params['speakerCount'] = recordingInfo.speakerCount
      console.log(params)

      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (!p){
          console.log("platform error")
          response.status = "failed"
          response.message = "Platform error. Please relogin RingCentral."
          return response
      }

      var endpoint = `/ai/insights/v1/async/analyze-interaction?webhook=${process.env.RCAI_WEBHOOK_ADDRESS}`

      var resp = await p.post(endpoint, params)
      var jsonObj = await resp.json()
      console.log(new Date().toISOString())
      console.log(jsonObj)

      var query = `UPDATE rcai_user_${this.extensionId} SET processed=2 WHERE uid='${recordingInfo.uid}'`
      var result = await pgdb.updateAsync(query)
      if (!result){
          console.error("Update db failed");
      }else{
          console.log("TRANSCRIPT IN-PROGRESS");
      }
      response.status = "in_progress"
      response.message = "Transcribing ..."

      var query = "INSERT INTO inprogressed_transcription"
      query += " (transcript_id, item_id, ext_id, audio_src) VALUES ($1, $2, $3, $4)"
      var values = [jsonObj.jobId, recordingInfo.uid, this.extensionId, recordingInfo.contentUri]
      query += " ON CONFLICT DO NOTHING"
      var result = await pgdb.insertAsync(query, values)
      if (!result){
          console.error("Insert db failed");
      }else{
          console.log("register transcript_id")
      }
    }catch(e){
      console.log(e.message)
      response.status = "failed"
      response.message = "Cannot call speech to text endpoint."
    }
    return response
  },
  transcribe_tbd: async function(recordingInfo, res) {
    var data = null
    var contentUri = recordingInfo.contentUri
    var audioType = "CallCenter"
    var encoding = "Mpeg"
    if (recordingInfo.type == "VR"){
      audioType = "Meeting"
      encoding = "Mp4"
    }

    try{
      var params = {
          encoding: encoding,
          languageCode: "en-US",
          source: "RingCentral",
          audioType: audioType,
          separateSpeakerPerChannel: false,
          enableVoiceActivityDetection: true,
          enableWordTimings: true,
          contentUri: contentUri,
          //speakerCount: recordingInfo.speakerCount,
          speakerIds: recordingInfo.speakerIds,
          insights: [ "All" ]
        }
      if (recordingInfo.hasOwnProperty(speakerCount))
        params['speakerCount'] = recordingInfo.speakerCount
      console.log(params)
      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (!p){
          console.log("platform error")
          var response = {
            status: "failed",
            message: "Platform error. Please relogin RingCentral.",
            uid: recordingInfo.uid
          }
          if (res != null){
            res.send(JSON.stringify(response))
          }
          return
      }

      //var endpoint = `/ai/insights/v1/async/analyze-interaction?webhook=${process.env.RCAI_WEBHOOK_ADDRESS}?params=${recordingInfo.uid}:Transcribe`
      var endpoint = `/ai/insights/v1/async/analyze-interaction?webhook=${process.env.RCAI_WEBHOOK_ADDRESS}`

      var resp = await p.post(endpoint, params)
      var jsonObj = await resp.json()
      console.log(new Date().toISOString())
      console.log(jsonObj)

      var passed = true
      var response = {
        uid: recordingInfo.uid
      }
      if (passed){
        var query = `UPDATE rcai_user_${this.extensionId} SET processed=2 WHERE uid='${recordingInfo.uid}'`
        //var query = `UPDATE ${table} SET processed=2 WHERE uid='${jsonObj.jobId}'`
        var result = await pgdb.updateAsync(query)
        if (!result){
          console.error("Update db failed");
        }else{
          console.log("TRANSCRIPT IN-PROGRESS");
        }
        /*

        pgdb.update(query, function(err, result) {
          if (err){
            console.error(err.message);
          }else{
            console.error("TRANSCRIPT IN-PROGRESS");
          }
        });
        */
        response['status'] = "in_progress"
        response['message'] = "Transcribing ..."

        if (res != null){
          res.send(JSON.stringify(response))
          res = null
        }

        var query = "INSERT INTO inprogressed_transcription"
        query += " (transcript_id, item_id, ext_id, audio_src) VALUES ($1, $2, $3, $4)"
        //var values = [recordingInfo.uid, recordingInfo.uid, this.extensionId, recordingInfo.contentUri]
        var values = [jsonObj.jobId, recordingInfo.uid, this.extensionId, recordingInfo.contentUri]
        query += " ON CONFLICT DO NOTHING"
        //console.log("query:", query)
        //console.log("values:", values)
        var result = await pgdb.insertAsync(query, values)
        //console.log("result:", result)
        if (!result){
          console.error("Insert db failed");
        }else{
          console.log("register transcript_id")
        }
        /*
            pgdb.insert(query, values, (err, result) =>  {
              if (err){
                console.error(err.message);
              }
              console.log("register transcript_id")
            })
        */
      }else{
          response['status'] = "failed"
          response['message'] = "Error description"
      }

      if (res != null){
        res.send(JSON.stringify(response))
        res = null
      }
    }catch(e){
      console.log(e.message)
      var response = {
        status: "failed",
        message: "Cannot call speech to text endpoint.",
        uid: recordingInfo.uid //recordingInfo.contentUri
      }
      if (res != null){
        res.send(JSON.stringify(response))
        res = null
      }
    }
  },
  /*
  parseTranscription: async function(uid, audioSrc, jsonObj){
    console.log("parseTranscription")
    // First read the record host and participants to get their names
    var query = `SELECT host, participants, call_type FROM ai_user_${this.extensionId} WHERE uid='${uid}'`
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
    console.log("participantsObj", participantsObj)
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
            var speaker = {
              id: item.speakerId,
              name: this._getSpeakerName(item.speakerId) // `Speaker ${item.speakerId}`
            }
            speakers.push(speaker)
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

    var subject = (conversationalInsights.shortAbstract.length > 0) ? conversationalInsights.shortAbstract[0].text : "N/A"
    var reExp = new RegExp("'","g")
    subject = subject.replace(reExp, "''")

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


    var query = `UPDATE ai_user${this.extensionId} SET processed=1`
    query += `, wordsandoffsets='${wno}'`
    query += `, transcript='${transcript}'`
    query += `, conversations='${convo}'`
    query += `, conversational_insights='${conversationalInsights}'`
    query += `, utterance_insights='${utteranceInsights}'`
    query += `, speaker_insights='${speakerInsights}'`
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
  _identifySpeaker: function(speakerId){
      if (speakerId === this.extensionId){
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
    }else if (callType == "CR" && speakerCount > 2){
      if (  /*speakerId == '0' ||*/ // only if first speaker is speaker 0!!!
            text.indexOf("this call is being recorded") >= 0 ||
            text.indexOf("if you do not wish to be recorded please disconnect at this time.") >= 0 ||
            text.indexOf("please disconnect at this time") >= 0 ){
        return "Operator"
      }else{
        console.log("this else 1111")
        var found = speakers.find(o => o.id == speakerId)
        console.log(found)
        if (found){ // found 1 identified speaker => check and return the name of the other one
          return found.name
        }else{
          console.log("Why:", speakers, speakerId)
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
      if (speakerId === this.extensionId){
        return this.userName
      }else{
        return `Speaker ${speakerId}`
      }
  }
}
module.exports = RCAIEngine;
