var path = require('path')
var util = require('util')
var multer = require('multer');
//const fs = require('fs')

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + file.originalname)
  }
})
var upload = multer({ storage: storage })


require('dotenv').load();

var express = require('express');
var session = require('express-session');

var app = express();

app.use(session({ secret: 'this-is-a-secret-token' , cookie: { maxAge: 6 * 24 * 60 * 60 * 1000 }, resave: true, saveUninitialized: true}));
var bodyParser = require('body-parser');
var urlencoded = bodyParser.urlencoded({extended: true})

app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(urlencoded);

var port = process.env.PORT || 3000

var server = require('http').createServer(app);
server.listen(port);
console.log("listen to port " + port)
var router = require('./router');


app.get('/', function (req, res) {
  res.redirect('index')
})

app.get('/login', function (req, res) {
  if (!req.session.hasOwnProperty("userId"))
    req.session.userId = 0;
  if (!req.session.hasOwnProperty("extensionId"))
    req.session.extensionId = 0;

  router.loadLogin(req, res)
})

app.get('/index', function (req, res) {
  res.render('index')
})

app.get('/logout', function (req, res) {
  router.logout(req, res)
})

app.get('/readlog', function (req, res) {
  router.loadReadLogPage(req, res)
})

app.get('/enrollspeaker', function (req, res) {
  router.loadEnrollmentPage(req, res)
})

app.get('/oauth2callback', function(req, res){
  console.log("callback redirected")
  router.login(req, res)
})

app.get('/about', function (req, res) {
  res.render('about')
})

app.get('/checktranscription', function (req, res) {
  router.checkTranscriptionResult(req, res)
})

app.get('/canceltranscription', function (req, res) {
  console.log("cancelTranscription clicked")
  router.cancelTranscriptionProcess(req, res)
})

app.post('/readlogs', function (req, res) {
  console.log("readCallRecordingsAsync")
  router.readCallRecordingsAsync(req, res)
})

app.post('/read-meetings', function (req, res) {
  console.log("readMeetingRecordingsAsync")
  router.readMeetingRecordingsAsync(req, res)
})
/*
app.post('/createrecord', function (req, res) {
  console.log("createRecord")
  router.createRecord(req, res)
})
*/
app.post('/enablenotification', function (req, res) {
  console.log("enable notification")
  //console.log(req.body)
  router.subscribeForNotification(req, res)
  //res.send('{"result":"ok"}')
})

app.get('/disablenotification', function (req, res) {
  console.log("disable notification")
  router.removeSubscription(req, res)
})

app.get('/recordedcalls', function (req, res) {
  console.log("loadFromDB")
  router.loadCallsFromDB(req, res)
})

app.post('/search', function (req, res) {
  console.log("searchCallsFromDB")
  router.searchCallsFromDB(req, res)
})

app.post('/transcribe', function (req, res) {
  console.log("user clicks transcribe")
  router.transcriptCallRecording(req, res)

})

app.post('/analyze', function (req, res) {
  console.log("user clicked analyze")
  console.log("searchWord: " + req.body.searchWord)
  router.analyzeContent(req, res)
})

app.get('/proxyaudio', function (req, res) {
  console.log("proxy audio")
  router.proxyAudio(req, res)
})
/*
app.post('/delete-single', function (req, res) {
  console.log("user clicks remove")
  router.deleteItemFromDb(req, res)
})

app.post('/delete-multiple', function (req, res) {
  console.log("user clicks delete")
  router.deleteItemsFromDb(req, res)
})
*/
app.post('/setsubject', function (req, res) {
  console.log("user clicks set subject")
  router.saveNewSubject(req, res)
})
app.post('/set-speakers', function (req, res) {
  console.log("user clicks set speakers")
  router.saveSpeakers(req, res)
})

app.post('/setfullname', function (req, res) {
  console.log("user clicks set fullname")
  router.saveFullName(req, res)
})
/*
app.post('/findsimilar', function (req, res) {
  console.log("findSimilar")
  router.findSimilar(req, res)
})
*/
app.get('/enrollment', function (req, res) {
  if (req.session.extensionId != 0)
    router.readEnrollment(req, res)
  else{
    res.render('index')
  }
})

app.get('/delete-enrollment', function (req, res) {
  if (req.session.extensionId != 0)
    router.deleteEnrollment(req, res)
  else{
    res.render('index')
  }
})

app.post('/start-enrollment', upload.single('file'), function (req, res, next) {
  var oldpath = req.file.path;
  if (req.session.extensionId != 0)
    router.startEnrollment(req, res)
  else{
    res.render('index')
  }
})

app.post('/webhooks', function(req, res) {
  var headers = req.headers;
  var validationToken = headers['validation-token'];
  var body = [];
  if(validationToken) {
      res.setHeader('Validation-Token', validationToken);
      res.statusCode = 200;
      res.end();
  } else {
      req.on('data', function(chunk) {
          body.push(chunk);
      }).on('end', function() {
          body = Buffer.concat(body).toString();
          var jsonObj = JSON.parse(body)
          router.handleWebhooksPost(jsonObj)
          res.statusCode = 200;
          res.end();
      });
  }
})

app.post('/rc_ai_callback?*', function (req, res) {
  var body = [];
  req.on('data', function(chunk) {
      body.push(chunk);
  }).on('end', function() {
      body = Buffer.concat(body).toString();
      var jsonObj = JSON.parse(body)
      if (jsonObj.api == "/ai/insights/v1/async/analyze-interaction"){
        router.handleRCAICallback(jsonObj)
      }else {
        console.log("Unexpected");
      }
  });
  res.statusCode = 200
  res.send("")
})
