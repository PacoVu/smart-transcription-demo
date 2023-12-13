const pgdb = require('./db')

function RCAIEngine(rcPlatform, extensionId, userName) {
  this.rc_platform = rcPlatform
  this.extensionId = extensionId
  this.userName = userName
  return this
}
RCAIEngine.prototype = {
  transcribe: async function(recordingInfo) {
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
  }
}
module.exports = RCAIEngine;
