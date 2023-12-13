const pgdb = require('./db')
const RCPlatform = require('./platform.js')

require('dotenv').load()

const ONE_DAY_TIMER_INTERVAL = 86400000

function User(id) {
  this.id = id;
  this.extensionId = ""
  this.accountId = ""
  this.extIndex = 0
  this.userName = ""
  this.mainCompanyPhoneNumber = ""
  this.utcOffset = undefined
  this.rc_platform = new RCPlatform(id)
  this.autoRefreshTimer = undefined
  this.enrollmentData = {
    status: "notfound",
    message: "",
    data: undefined
  }
  return this
}

User.prototype = {
  setExtensionId: function(id) {
    this.extensionId = id
  },
  getUserId: function(){
    return this.id
  },
  getExtensionId: function(){
    return this.extensionId
  },
  getAccessToken: async function (){
    let at = await this.rc_platform.getAccessToken(this.extensionId)
    return at
  },
  getUserTable: function(){
    return `rcai_user_${this.extensionId}`
  },
  getPlatformSDK: function(){
    return this.rc_platform.getSDKPlatform()
  },
  getSubscriptionId: function(){
    return this.rc_platform.getSubscriptionId()
  },
  getUserName: function(){
    return this.userName
  },
  loadReadLogPage: async function(req, res){
    if (!this.utcOffset)
      this.utcOffset = parseInt(req.query.utcOffset)
    var query = `SELECT sub_id FROM rcai_users WHERE ext_id=${this.extensionId}`;
    var result = await pgdb.readAsync(query)
    var autoProcessing = false
    if(result == null || !result.rows){
        console.log("Cannot read subscription table");
        res.render('index')
        return
      }
    if (result.rows.length == 0){
        console.log("no subId found. Default to no auto processing")
    }else{
        // found the subId, use it to check and renew
        var subId = result.rows[0].sub_id
        if (subId != ""){
          let active = this._checkRegisteredSubscription(subId)
          if (active){
            autoProcessing = true
          }else{
            var query = `UPDATE rcai_users SET sub_id='' WHERE ext_id=${this.extensionId}`
            var response = await pgdb.updateAsync(query)
            if (!response){
                console.error("Update sub_id failed");
            }
          }
        }
    }
    res.render('readlog', {
        userName: this.userName,
        extensionId: this.extensionId,
        autoProcessingOn: autoProcessing
      })
  },
  loadEnrollmentPage: async function(req, res){
    res.render('enrollspeaker', {
        userName: this.userName,
        extensionId: this.extensionId
    })
  },
  readEnrollment: async function(res) {
      if (this.enrollmentData.status == "processing"){
        res.send(this.enrollmentData)
        return
      }else if (this.enrollmentData.status == "failed"){
        res.send(this.enrollmentData)
        this.enrollmentData.status = "ok"
        return
      }
      var platform = await this.rc_platform.getPlatform(this.extensionId)
      if (platform){
        try{
          let endpoint = `/ai/audio/v1/enrollments/${this.extensionId}`
          var resp = await platform.get(endpoint)
          var jsonObj = await resp.json()
          this.enrollmentData.status = "ok"
          this.enrollmentData.data = jsonObj
        }catch(e){
          console.log("failed", e.message)
          this.enrollmentData.status = "notfound"
        }
        res.send(this.enrollmentData)
      }
  },
  deleteEnrollment: async function(res) {
      if (this.enrollmentData.data){
        var platform = await this.rc_platform.getPlatform(this.extensionId)
        if (platform){
          try{
           let endpoint = `/ai/audio/v1/enrollments/${this.enrollmentData.data.enrollmentId}`
           var resp = await platform.delete(endpoint)
           this.enrollmentData.status = "notfound"
           this.enrollmentData.data = undefined
         }catch(e){
           console.log("failed", e.message)
         }
        }
      }
      res.send(this.enrollmentData)
  },
  startEnrollment: function(filePath, res){
      this.enrollmentData.status = "processing"
      res.send(this.enrollmentData)
      this.doEnrollment(filePath, res)
  },
  doEnrollment: async function(filePath, res){
      const base64Data = fs.readFileSync(filePath, {encoding: 'base64'});
      var params = {
            encoding: "Webm",
            languageCode: "en-US",
            content: base64Data
          }
      var platform = await this.rc_platform.getPlatform(this.extensionId)
      if (platform){
        try{
          console.log(this.enrollmentData)
          if (this.enrollmentData.data){
            console.log("Update")
            var resp = await platform.patch(`/ai/audio/v1/enrollments/${this.extensionId}`, params)
          }else{
            console.log("Create new enrollment")
            params['enrollmentId'] = this.extensionId.toString()
            var resp = await platform.post('/ai/audio/v1/enrollments', params)
          }
          var jsonObj = await resp.json()
          this.enrollmentData.data = jsonObj
          this.enrollmentData.status = "ok"
          this.enrollmentData.message = "Enrollment completed."
          console.log(this.enrollmentData)
        }catch (e){
          console.log(e.message)
          this.enrollmentData.status = "failed"
          this.enrollmentData.message = "Recording is too long. Please record less than 30 seconds and enroll again."
          //res.send(this.enrollmentData)
        }
      }else{
        console.log("platform error")
        this.enrollmentData.status = "failed"
        this.enrollmentData.message = "Your have been logged out. Please relogin and try again."
      }
  },
  login: async function(req, res, callback){
    if (req.query.code) {
      console.log("CALL LOGIN FROM USER")
      var extensionId = await this.rc_platform.login(req.query.code)
      if (extensionId){
          this.extensionId = extensionId

          var response = await pgdb.createTableAsync('rcai_users')
          if (!response)
            console.log("create transcription status table failed")

          var response = await pgdb.createTableAsync(this.getUserTable())
          if (!response)
            console.log("create user table failed")

          var response = await pgdb.createTableAsync("inprogressed_transcription")
          if (!response)
            console.log("create transcription status table failed")

          var p = await this.rc_platform.getPlatform(this.extensionId)
          if (p){
            try {
              var resp = await p.get('/restapi/v1.0/account/~/extension/~/')
              var jsonObj = await resp.json();
              this.accountId = jsonObj.account.id
              this.userName = jsonObj.contact.firstName
              this.userName += (this.userName == "") ? jsonObj.contact.lastName : ` ${jsonObj.contact.lastName}`
              await this.readPhoneNumber(p)
              var tokens = await p.auth().data()
              var query = "INSERT INTO rcai_users (ext_id, acct_id, sub_id, tokens, full_name, main_company_number) VALUES ($1, $2, $3, $4, $5, $6)"
              query += ` ON CONFLICT (ext_id) DO UPDATE SET tokens='${JSON.stringify(tokens)}', full_name='${this.userName}', main_company_number='${this.mainCompanyPhoneNumber}'`
              var values = [this.extensionId, this.accountId, '', JSON.stringify(tokens), this.userName, this.mainCompanyPhoneNumber]
              var response = await pgdb.insertAsync(query, values)
              if (!response){
                console.log(query)
                console.log("Insert user failed");
              }

              if (this.rc_platform && !this.autoRefreshTimer){
                var thisUser = this
                this.autoRefreshTimer = setInterval(function(){
                    thisUser.autoRefresh()
                }, ONE_DAY_TIMER_INTERVAL)
              }
              res.send('login success');
              callback(null, extensionId)
            }catch(e) {
              console.log("Failed")
              console.error(e.message);
              callback("error", this.id)
            }
        }else {
          console.log("Platform error")
        }
      }else{
        callback("failed", this.id)
      }
    } else {
      res.send('No Auth code');
      callback("no oauth code", this.id)
    }
  },
  autoRefresh: async function(){
    console.log("AUTO REFRESH")
    let p = await this.rc_platform.getPlatform(this.extensionId)
    if (!p){
      clearInterval(this.autoRefreshTimer)
      this.autoRefreshTimer = null
    }
  },
  readPhoneNumber: async function(p){
    if (p){
      try{
        var resp = await p.get('/restapi/v1.0/account/~/extension/~/phone-number')
        var jsonObj = await resp.json();
        var count = jsonObj.records.length
        for (var record of jsonObj.records){
          if (record.usageType == "MainCompanyNumber"){
            this.mainCompanyPhoneNumber = record.phoneNumber.replace("+", "")
            break;
          }
        }
        if (this.mainCompanyPhoneNumber == ""){
          for (var record of jsonObj.records){
            if (record.usageType == "CompanyNumber"){
              this.mainCompanyPhoneNumber = record.phoneNumber.replace("+", "")
              break;
            }
          }
        }
      }catch(e) {
        console.log("Failed")
        console.error(e.message);
      }
    }
  },
  logout: async function(req, res){
    console.log("LOGOUT FUNC")
    if (this.autoRefreshTimer)
      clearInterval(this.autoRefreshTimer)
    // check if this user has set auto processing
    var query = `SELECT sub_id FROM rcai_users WHERE ext_id=${this.extensionId}`
    var result = await pgdb.readAsync(query)
    var autoProcessing = false
    if (result && result.rows.length > 0){
        autoProcessing = (result.rows[0].sub_id != "") ? true : false
    }
    console.log("autoProcessing", autoProcessing)
    if (!autoProcessing){
      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (p){
        try{
          console.log("Revoke")
          await p.logout()
          return "ok"
        }catch (e) {
          console.log('ERR ' + e.message || 'Server cannot authorize user');
          return null
        }
      }else{
        return null
      }
    }else {
      return "ok"
    }
  },
  subscribeForNotification: async function (req, res){
        var p = await this.rc_platform.getPlatform(this.extensionId)
        if (!p){
          console.log("Must relogin");
          res.send({status: "failed", message:"Platform error. Please relogin."})
          return
        }
        var query = `SELECT sub_id FROM rcai_users WHERE ext_id=${this.extensionId}`
        var result = await pgdb.readAsync(query)
        if (!result){
          console.log("Read db failed");
          res.send({status: "failed", message: "Cannot read data."})
          return
        }else{
          if (result.rows.length == 0){
            console.log("no subId found. create one after")
            var subscriptionId = await this._subscribeForNotification(p)
            if (subscriptionId){
                var tokens = await p.auth().data()
                var query = `UPDATE rcai_users SET sub_id='${subscriptionId}', tokens='${JSON.stringify(tokens)}' WHERE ext_id=${this.extensionId}`
                var response = await pgdb.updateAsync(query)
                if (!response){
                    console.error("Insert sub_id failed");
                }
                console.log("register subId successfully")
                res.send({status: "ok", message: "Ready to receive new recording notification."})
            }else{
                res.send({status: "failed", message: "Cannot subscribe for notification."})
            }
          }else{
            // found the subId, use it to check and renew
            var subscriptionId = result.rows[0].sub_id
            if (subscriptionId == ''){
              subscriptionId = await this._subscribeForNotification(p)
              if (subscriptionId){
                  res.send({status: "ok", message: "Ready to receive new recording notification"})
                  var tokens = await p.auth().data()
                  var query = `UPDATE rcai_users SET sub_id='${subscriptionId}', tokens='${JSON.stringify(tokens)}' WHERE ext_id=${this.extensionId}`
                  var response = await pgdb.updateAsync(query)
                  if (!response){
                      console.error("Update sub_id failed");
                  }else{
                    console.log("RESUBSCRIBE SUBSCRIPTION OK")
                  }
              }else{
                res.send({status: "failed", message: "Cannot subscribe for notification. Please try again."})
              }
            }else{
              await this._removeOrphanSubscription(p, subscriptionId)
              console.log("OLD ORPHANED SUBSCRIPTION REMOVED")
              var subscriptionId = await this._subscribeForNotification(p)
              if (subscriptionId){
                res.send({status: "ok", message: "Ready to receive new recording notification"})
                var query = `UPDATE rcai_users SET sub_id='${subscriptionId}', WHERE ext_id=${this.extensionId}`
                var response = await pgdb.updateAsync(query)
                if (!response){
                    console.error("Update sub_id failed");
                }else{
                  console.log("RESUBSCRIBE SUBSCRIPTION OK")
                }
              }else{
                res.send({status: "failed", message: "Cannot subscribe for notification. Please try again."})
                var query = `UPDATE rcai_users SET sub_id='', WHERE ext_id=${this.extensionId}`
                var response = await pgdb.updateAsync(query)
              }
            }
          }
        }
    },
    _subscribeForNotification: async function(p){
      var eventFilters = ['/restapi/v1.0/account/~/extension/~/telephony/sessions']
      try {
        var resp = await p.post('/restapi/v1.0/subscription', {
              eventFilters: eventFilters,
              deliveryMode: {
                transportType: process.env.DELIVERY_MODE_TRANSPORT_TYPE,
                address: process.env.DELIVERY_MODE_ADDRESS
              },
              expiresIn: process.env.WEBHOOK_EXPIRES_IN // 31104000 // 630720000 //
        })
        var jsonObj = await resp.json()
        return jsonObj.id
      }catch(e){
        var obj = e.response.headers
        console.log(obj.get('rcrequestid'))
        console.log("_subscribeForNotification: " + e.message)
        return null
      }
    },
    removeSubscription: async function(res) {
      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (!p){
        res.send({status:"failed", message: "Platform error. Please relogin."})
        return
      }
      var query = `SELECT sub_id FROM rcai_users WHERE ext_id=${this.extensionId}`
      var result = await pgdb.readAsync(query)
      if (!result){
          res.send({status: "failed", message: "Cannot read db."})
          console.log("Cannot read subscription");
          return
        }
      if (result.rows.length == 0){
          res.send({status: "ok"})
          console.log("no subId found. don't know what subscription to delete")
      }else{
          var subId = result.rows[0].sub_id
          if (subId != ''){
            try {
              var resp = await p.delete(`/restapi/v1.0/subscription/${subId}`)
              console.log("deleted: " + subId)
            }catch(e) {
              console.log(e.message);
            }
            var query = `UPDATE rcai_users SET sub_id='' WHERE ext_id=${this.extensionId}`
            var response = await pgdb.updateAsync(query)
            if (!response){
                console.error("Update sub_id failed");
            }else{
              console.log("RESET SUBSCRIPTION OK")
            }
          }else{
            console.log("No subscription to delete")
          }
          res.send({status:"ok"})
      }
    },
    _checkRegisteredSubscription: async function(subscriptionId) {
      var subscriptionActive = false
      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (p){
        try {
          var resp = await p.get('/restapi/v1.0/subscription')
          var jsonObj = await resp.json();
          if (jsonObj.records.length > 0){
            for(var record of jsonObj.records) {
              if (record.id == subscriptionId) {
                if (record.deliveryMode.transportType == "WebHook"){
                  if (record.status == "Blacklisted"){
                    await p.delete(`/restapi/v1.0/subscription/${record.id}`)
                    subscriptionActive = false
                    break
                  }else if (record.status != "Active"){
                    console.log("subscription is not active. Renew it")
                    await p.post(`/restapi/v1.0/subscription/${subscriptionId}/renew`)
                    subscriptionActive = true
                    break
                  }else {
                    console.log("subscription is active. Good to go.")
                    subscriptionActive = true
                    break
                  }
                }
              }
            }
          }else{
            console.log("No subscription for this service => Create one")
          }
        }catch(e) {
          console.log(e.message);
        }
      }
      return subscriptionActive
    },
    _removeOrphanSubscription: async function(p, subId) {
      console.log("_removeOrphanSubscription: " + subId)
      try {
        var resp = await p.get('/restapi/v1.0/subscription')
        var jsonObj = await resp.json();
          if (jsonObj.records.length > 0){
            for(var record of jsonObj.records) {
              // delete old subscription before creating a new one
              if (record.id == subId){
                await p.delete('/restapi/v1.0/subscription/' + record.id)
                console.log("deleted by subId: " + record.id)
                return
              }
            }
          }else{
            console.log("no existing subscription")
            return
          }
      }catch(e) {
        console.log(e.message);
        return
      }
    },
    saveNewSubject: function(req, res){
      var query = `UPDATE ${this.getUserTable()} SET subject='${req.body.subject}'`
      query += ` WHERE uid=${req.body.uid}`
      pgdb.update(query, (err, result) => {
        if (err){
          console.log("CANNOT UPDATE SUBJECT" + err.message);
          res.send('{"status":"failed","result":"' + err.message + '"}')
        }else{
          res.send('{"status":"ok","result":"Subject changed"}')
        }
      });
    },
    saveNewFullName: function(req, res){
      var query = `UPDATE ${this.getUserTable()} SET ${req.body.field}='${req.body.full_name}'`
      query += ` WHERE uid=${req.body.uid}`;
      pgdb.update(query, (err, result) => {
        if (err){
          console.log("CANNOT UPDATE FULLNAME" + err.message);
          res.send('{"status":"failed","result":"' + err.message + '"}')
        }else{
          res.send('{"status":"ok","result":"Full name changed"}')
        }
      });
    },
    saveSpeakers: function(req, res){
      var query = `UPDATE ${this.getUserTable()} SET speakers='${req.body.speakers}' WHERE uid='${req.body.uid}'`
      pgdb.update(query, (err, result) => {
        if (err){
          res.send('{"status":"failed","result":"' + err.message + '"}')
        }else{
          res.send('{"status":"ok","result":"Speaker name changed"}')
        }
      });
    },
    analyzeContent: async function(req, res){
      var query = `SELECT * FROM ${this.getUserTable()} WHERE uid=${req.body.CallId}`
      let result = await pgdb.readAsync(query)
      if (!result){
          res.send({
            status: "failed",
            message: "Not found"
          })
          return console.error(err.message);
      }
      var row = result.rows[0]
      var accessToken = await this.rc_platform.getAccessToken(this.extensionId) // generate valid tokens
      if (accessToken == ""){
        req.session.destroy()
        res.render('index')
        return
      }
      var page = 'voicecall'
      if (row.call_type == 'VR'){
          row.recording_url += `?access_token=${accessToken}`
          page = 'videocall'
      }else if (row.call_type == 'CR'){
          row.recording_url += `?access_token=${accessToken}`
      }else if (row.call_type == 'ULV'){
          page = 'videocall'
      }

      res.render(page, {
          results: row,
          companyNumber: this.mainCompanyPhoneNumber,
          searchWord: req.body.searchWord,
          searchArg: req.body.searchArg,
          userName: this.getUserName(),
          utcOffset: this.utcOffset
      })
    },
    readMeetingRecordingsAsync: async function(req, res){
      console.log("readMeetingRecordingsAsync")
      var body = req.body
      var endpoint = '/rcvideo/v1/history/meetings'
      // Error: In order to call this API endpoint, application needs to have [Video] permission
      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (p){
        console.log("From: " + body.dateFrom)
        console.log("To: " + body.dateTo)
        var params = {
          dateFrom: body.dateFrom,
          dateTo: body.dateTo,
          perPage: 1000
        }

        var queryParams = {
          type: "All",
          perPage: 100
        }

        var resp = await p.get(endpoint,queryParams)
        var jsonObj = await resp.json()
        for (item of jsonObj.meetings){
          if (item.recordings.length){
            for (var rec of item.recordings){
              if (rec.availabilityStatus == "Alive"){
                var startTime = new Date(item.startTime).getTime()
                var type = (item.type == "Meeting") ? "VR" : "VR"
                var subject = item.displayName
                var fromObj = {
                  name: item.hostInfo.displayName,
                  phone_number: '',
                  extension_id: item.hostInfo.extensionId
                }

                var toObj = []
                for (var p of item.participants){
                  var participant = {
                    name: p.displayName,
                    phone_number: '',
                    extension_id: (p.extensionId) ? p.extensionId : ''
                  }
                  toObj.push(participant)
                }
              }
              var query = `INSERT INTO ${this.getUserTable()}`
              query += " (uid, rec_id, call_date, call_type, host, participants, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, conversational_insights, utterance_insights, speaker_insights, subject, speakers)"
              query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)"
              var values = [item.shortId, rec.id,startTime,type,JSON.stringify(fromObj),JSON.stringify(toObj),rec.url,item.duration,'Out',0,'[]',"",'[]','{}','[]','{}',subject,'[]']
              query += " ON CONFLICT DO NOTHING"
              await pgdb.insertAsync(query, values)
            }
          }
        }
        res.send('{"status":"ok"}')
      }else{
        console.log("platform error")
        req.session.destroy()
        res.render('/index')
        return
      }
    },
    searchCallsFromDB: function(req, res){
      var query = `SELECT * FROM ${this.getUserTable()}`
      var filterQuery = "true"
      var searchQuery = ""
      if (req.body.types != undefined){
        if (req.body.types != "")
          filterQuery = "call_type='" + req.body.types + "'"
      }

      var searchArg = req.body.search.trim()
      if (!searchArg) {
        searchArg = '*';
      }
      if (req.body.fields == "all"){
        if (searchArg != "*") {
            searchQuery += "(transcript ILIKE '%" + searchArg + "%' OR "
            searchQuery += `participants @> '[{"name":"${searchArg}"}]' OR participants @> '[{"phone_number":"${searchArg}"}]'`
            searchQuery += "OR host->>'name' ILIKE '%" + searchArg + "%')"
        }
      }else if (req.body.fields == "transcript"){
        searchQuery += "processed=1"
        if (searchArg != "*") {
          searchQuery += " AND transcript ILIKE '%" + searchArg + "%'";
        }
      }else if (req.body.fields == "from"){
        if (searchArg != "*") {
          searchQuery += "host->>'name' ILIKE '%" + searchArg + "%' OR host->>'phone_number' ILIKE '%" + searchArg + "%'"
        }
      }else if (req.body.fields == "to"){
        if (searchArg != "*") {
          searchQuery += `participants @> '[{"name":"${searchArg}"}]' OR participants @> '[{"phone_number":"${searchArg}"}]'`
        }
      }

      if (filterQuery != "true")
        query +=  " WHERE " + filterQuery
      if (searchQuery != ""){
        if (filterQuery == "true")
          query +=  " WHERE " + searchQuery
        else
          query +=  " AND " + searchQuery
      }
      var retObj = {
        searchArg: searchArg,
        fieldArg: req.body.fields,
        typeArg: req.body.types,
        utcOffset: this.utcOffset
      }
      this.readFullData(query, retObj, res, req.body.fields, searchArg)
    },
    readFullData: async function(query, retObj, res, field, keyword){
      console.log(query)
      var result = await pgdb.readAsync(query)
      if (!result){
          console.log("Error!!!")
          res.render('recordedcalls', {
              calls: [],
              searchArg: retObj.searchArg,
              fieldArg: retObj.fieldArg,
              typeArg: retObj.typeArg,
              itemCount: 0,
              extensionArgs: retObj.extensionArgs,
              userName: this.getUserName(),
            })
          return console.error(err.message);
      }
        var rows = result.rows
        for (var i = 0; i < rows.length; i++){
          rows[i].duration = formatDurationTime(rows[i].duration)
          if (retObj.searchArg != "*"){
              rows[i]['searchMatch'] = ""
              const MAX_LENGTH = 90
              var searchWord = retObj.searchArg.toLowerCase()
              var sent = ""
              for (var sentence of rows[i].conversations){
                  sent = sentence.sentence.join(' ')
                  var index = sent.toLowerCase().indexOf(searchWord)
                  var sentenceLen = sent.length -1
                  var startPos = 0
                  var stopPos = 0
                  var searchWordLen = retObj.searchArg.length
                  if (index == 0){
                    stopPos = (sentenceLen > MAX_LENGTH) ? MAX_LENGTH : sentenceLen
                    break
                  }else if (index > 0){
                    startPos = index - (MAX_LENGTH/2)
                    if (startPos < 0){
                      startPos = 0
                    }
                    stopPos = startPos + MAX_LENGTH
                    stopPos = (stopPos > sentenceLen) ? sentenceLen + 1 : stopPos
                    // check and set beginning of the first word
                    if (startPos > 0){
                      for (startPos; startPos<index; startPos++){
                        if (sent[startPos] == "."){
                          startPos += 1
                          break
                        }
                      }
                    }
                    // check and set end of the last word
                    var searchWordEndPos = index + searchWordLen - 1
                    if (searchWordEndPos < stopPos){
                      if (stopPos < sentenceLen){
                        var lowBoundary = index + searchWordLen
                        for (stopPos; stopPos>=lowBoundary; stopPos--){
                          if (sent[stopPos] == " " || sent[stopPos] == "," || sent[stopPos] == "."){
                            break
                          }
                        }
                      }
                    }
                    break
                  }
              }
              var truncatedText = sent.substring(startPos, stopPos)
              rows[i]['searchMatchOriginal'] = truncatedText
              if (startPos == 0){
                truncatedText += " ..."
              }else {
                truncatedText = "... " + truncatedText + " ..."
              }
              let searchArg = retObj.searchArg.replace("+", "")
              var regEx = new RegExp(searchArg, "ig");
              var hightlightTruncatedText = truncatedText.replace(regEx, '<span class="search-highlight"> ' + retObj.searchArg + "</span>")
              rows[i]['searchMatch'] = hightlightTruncatedText
              rows[i].conversations = "{}"
          }
        }
        rows.sort(sortDates)

        res.render('recordedcalls', {
            calls: rows,
            searchArg: retObj.searchArg,
            fieldArg: retObj.fieldArg,
            typeArg: retObj.typeArg,
            itemCount: rows.length,
            extensionArgs: retObj.extensionArgs,
            userName: this.getUserName(),
            utcOffset: this.utcOffset
          })
    },
    loadCallsFromDB: function(req, res){
      //var query = `SELECT uid, rec_id, call_date, call_type, duration, host, participants, recording_url, processed, conversational_insights, speaker_insights, utterance_insights, subject FROM ${this.getUserTable()}`
      var query = `SELECT * FROM ${this.getUserTable()}`
      var retObj = {
        searchArg: "*",
        fieldArg: "all",
        typeArg: "",
        extensionArgs: [],
        utcOffset: this.utcOffset
      }
      this.readFullData(query, retObj, res, null, "")
    },
    readCallRecordingsAsync: async function(body, res){
      var endpoint = `/restapi/v1.0/account/~/extension/${this.extensionId}/call-log`
      var params = {
        view: "Detailed",
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        showBlocked: true,
        recordingType: "All",
        type: "Voice",
        perPage: 1000
      }
      var p = await this.rc_platform.getPlatform(this.extensionId)
      if (!p){
        console.log("platform error")
        res.send({status:"failed", message: "Platform error. Please relogin."})
        return
      }

      // Read and parse call records to process call data and add to db within this function
      try {
        var resp = await p.get(endpoint, params)
        var jsonObj = await resp.json()
        if (jsonObj.records.length == 0){
          var errorRes = {
            status: "failed",
            message: 'No call data'
          }
          res.send(errorRes)
          return
        }
        const forLoop = async _ => {
          for (let record of jsonObj.records) {
            if (!record.hasOwnProperty("recording")){
              continue
            }
            var item = {}
            item['call_type'] = "CR"
            item['uid'] = record.recording.id
            item['recording_url'] = record.recording.contentUri
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
                toObj.phone_number = `${this.mainCompanyPhoneNumber}*${record.to.extensionNumber}`
              else
                toObj.phone_number = "Unknown #"
              if (record.to.hasOwnProperty('name'))
                toObj.name = record.to.name
              else
                toObj.name = "Unknown"

              if (record.to.hasOwnProperty('extensionId'))
                toObj.extension_id = record.to.extensionId
            }else{
              toObj.phone_number = "Unknown #"
              toObj.name = "Unknown"
            }

            if (record.hasOwnProperty('from')){
              if (record.from.hasOwnProperty('phoneNumber'))
                fromObj.phone_number = record.from.phoneNumber
              else if (record.from.hasOwnProperty('extensionNumber'))
                fromObj.phone_number = `${this.mainCompanyPhoneNumber}*${record.from.extensionNumber}`
              else
                fromObj.phone_number = "Unknown #"
              if (record.from.hasOwnProperty('name'))
                fromObj.name = record.from.name
              else
                fromObj.name = "Unknown"

              if (record.from.hasOwnProperty('extensionId'))
                fromObj.extension_id = record.from.extensionId
            }else{
              fromObj.phone_number = "Unknown #"
              fromObj.name = "Unknown"
            }

            item['call_date'] = new Date(record.startTime).getTime()
            item['processed'] = false
            item['rec_id'] = record.id
            item['duration'] = record.duration
            item['direction'] = (record.direction == "Inbound") ? "In" : "Out"
            if (item.direction == "Out"){
              item['host'] = fromObj
              item['participants'] = [toObj]
            }else{
              item['host'] = toObj
              item['participants'] = [fromObj]
            }
            var query = `INSERT INTO ${this.getUserTable()}`
            query += " (uid, rec_id, call_date, call_type, host, participants, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, conversational_insights, utterance_insights, speaker_insights, subject, speakers)"
            query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)"
            var values = [item.uid, item.rec_id,item.call_date,item.call_type,JSON.stringify(item.host),JSON.stringify(item.participants),item.recording_url,item.duration,item.direction,0,'[]',"",'[]','{}','[]','{}',"N/A",'[]']
            query += " ON CONFLICT DO NOTHING"

            var result = await pgdb.insertAsync(query, values)
            if (!result)
              console.error("INSERT ERR!!!");
          }
          res.send({status:"ok", message: `Read and added ${jsonObj.records.length} call records`})
        }
        forLoop()
      }catch(e){
        res.send({status: "failed", message: "Cannot access call log."})
        console.log("Cannot access call log.")
        console.log(e.message)
      }
    }
}
module.exports = User;

// global function
function formatDurationTime (duration){
  var hour = Math.floor(duration / 3600)
  var mins = Math.floor((duration % 3600) / 60)
  mins = (mins < 10) ? "0"+mins : mins
  var secs = Math.floor(((duration % 3600) % 60))
  secs = (secs < 10) ? "0"+secs : secs
  return `${hour}:${mins}:${secs}`
}


function sortDates(a,b) {
  return new Date(parseInt(b.call_date)) - new Date(parseInt(a.call_date));
}
