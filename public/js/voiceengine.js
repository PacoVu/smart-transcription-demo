window.onload = init;
// var aPlayer = null;
const TRUNCATE_LEN = 9
var index = 0;
var mIndex = 1;
var wwoArr = []
var utteranceArr = []
var wordElm = null;
var mContent = "";

var speakerSentiment = -1
var foundIndex = 0;
var positiveThreshold = 0.5;
var negativeThreshold = -0.5;
var fixedSubstractedHeight = 0;
const RIGHT_BLOCK_OFFSET = 193 // 170
const LEFT_BLOCK_OFFSET = 120 // 150
var conversationLastLine = 0
var wavesurfer;
var audioPlayLine;
var transcriptFontSize = 14;
var selectedOption = ''
var blockEndTimeStamp = 10000000
var displayMode = 'paragraphs'

let speakersArr = []

function init() {
  google.charts.load('current', {'packages':['corechart'], callback: onGloaded});

  fixedSubstractedHeight = $("#menu_header").height();
  fixedSubstractedHeight += $("#subject_header").height();
  //fixedSubstractedHeight += $("#footer").height()
  var h = $(window).height() - (fixedSubstractedHeight);
  h -= RIGHT_BLOCK_OFFSET
  $("#conversations_block").height(h);
  conversationLastLine = $("#conversations_block").position().top + (h - 20);
/*
  var sliderPos = document.getElementById("positiveSentimentRange");
  sliderPos.oninput = function() {
    positiveThreshold = this.value/1000;
    $("#posval").html(positiveThreshold.toFixed(2))
    var percent = (positiveThreshold * 100).toFixed(2);
    var style = 'linear-gradient(to right, #b8e986 0%, #b8e986 ' + percent + '%, #c8ccd1 ' + percent + '%, #c8ccd1)';
    sliderPos.style.background = style;
    displayAnalytics('sentiment')
  }

  var sliderNeg = document.getElementById("negativeSentimentRange");
  sliderNeg.oninput = function() {
      negativeThreshold = (this.value/1000) * -1;
      $("#negval").html(negativeThreshold.toFixed(2));
      var percent = (this.value / 10).toFixed(2);
      var style = 'linear-gradient(to right, #e98f86 0%, #e98f86 ' + percent + '%, #c8ccd1 ' + percent + '%, #c8ccd1)';
      sliderNeg.style.background = style;
      displayAnalytics('sentiment')
  }
*/
  $("#search").focus()
  $("#font_size_increase").click(function() {
    transcriptFontSize += 1;
    $("#conversations_block").css('font-size', transcriptFontSize + 'px');
    $("#conversations_block").css('line-height', (transcriptFontSize + 2) + 'px');
  });
  $("#font_size_decrease").click(function() {
    transcriptFontSize -= 1;
    $("#conversations_block").css('font-size', transcriptFontSize + 'px');
    $("#conversations_block").css('line-height', (transcriptFontSize + 2) + 'px');
  });

  // highlight search word
  if (window.searchWord !== ""){
    findSearchSentenceAndHighlight(window.searchWord)
  }

  $("#subject-field").val(truncateText(window.results.subject))
  speakersArr = window.results.speakers //.map(a => Object.assign({}, a));
  initializeAudioPlayer()

  for (var utterance of window.results.utterance_insights){
    utteranceText = utterance.text.trim()
    if (utteranceText != "")
      utteranceArr.push(utterance)
  }
  createConvoList()
  displayAnalytics('abstract')
}

function onGloaded(){
  createSpeakerInsights()
}


function createConvoList(){
  var index = 0
  displayMode = $('#transcript-mode').val()
  var html = ''
  if (displayMode == 'paragraphs'){
    $("#emotion-notation").hide()
    var convos = window.results.conversations
    html = '<table id="convo_container">'
    for (var i = 0; i < convos.length; i++) {
      var item = speakersArr.find(o => o.id === convos[i].speakerId)

      html += '<tr class="conversation_block">'
      var name = (item.name.length <= 12) ? item.name : `${item.name.substr(0, 10)}..`
      html += `<td class="scol speaker_name speaker_name_${item.id}"><b>${name} :</b></td>`
      html += `<td class="tcol conversation_text">`
      for (var n = 0; n < convos[i].sentence.length; n++) {
        var wId = "word" + index
        html += `<span onclick= "jumpTo(${convos[i].timestamp[n]})" class="unreadtext" id="${wId}"> ${convos[i].sentence[n]} </span>`
        index += 1
      }
      html += '</td></tr>'
    }
  }else if (displayMode == 'utterances'){ // parse to display utterance mode
    //utteranceArr
    $("#emotion-notation").show()
    html = '<table id="convo_container">'
    for (var i = 0; i < utteranceArr.length; i++) {
      var item = speakersArr.find(o => o.id === utteranceArr[i].speakerId)
      var emotion = 'neutral'
      if (utteranceArr[i].insights.length > 0)
        emotion = utteranceArr[i].insights[0].value.toLowerCase()
      var wId = 'word' + i
      html += '<tr class="conversation_block">'
      var name = (item.name.length <= 12) ? item.name : `${item.name.substr(0, 10)}..`
      html += `<td class="scol speaker_name speaker_name_${item.id} ${emotion}"><b>${name} :</b></td>`
      html += `<td class="tcol conversation_text">`
      html += `<span onclick= "jumpTo(${utteranceArr[i].start})" class="unreadtext" id="${wId}"> ${utteranceArr[i].text} </span>`
      html += '</td></tr>'
    }
  }else{
    // display pure transcripts
    $("#emotion-notation").hide()
    var i = 0
    for (var word of window.results.wordsandoffsets){
      var wId = "word" + i
      html += `<span onclick= "jumpTo(${word.offset})" class="unreadtext" id="${wId}"> ${word.word} </span>`
      i++
    }
  }
  $("#conversations_block").html(html)
  findCurrentmIndex()
  wordElm = document.getElementById(`word${mIndex}`);
}

function createSpeakerInsights(){
  var text = `<div>Number of participants: ${speakersArr.length}</div>`
  for (var speaker of speakersArr){
    text += `<div class="speaker-name-field"><input type="text" class="speaker-name" id="speaker-field-${speaker.id}" disabled value="${speaker.name}" size="15"></input>`
    text += `<img id="speaker-${speaker.id}-edit-btn" src='img/edit.png' class="edit_icon" onclick="enableEditSpeakerName('${speaker.id}', 'speaker-${speaker.id}-edit-btn')"></img></div>`
  }
  $("#speaker_insights").html(text)

  var energy_params = [[ 'Level', 'Engagement', { role: "style" } ]];
  var colors = ['#910608', '#d43306', '#f29a02', '#fc6603', '#0850d4', '#1c222e', '#e66a05']
  var i = 0
  var itemArr = window.results.speaker_insights.energy
  if (itemArr.length > 0){
    for (var item of itemArr){
      var speaker = speakersArr.find(o => o.id === item.speakerId)
      //text += `<div class="speaker-name-field"><input type="text" class="speaker-name" id="speaker-field-${speaker.id}" disabled value="${speaker.name}" size="15"></input>`
      //text += `<img id="speaker-${speaker.id}-edit-btn" src='img/edit.png' class="edit_icon" onclick="enableEditSpeakerName('${speaker.id}', 'speaker-${speaker.id}-edit-btn')"></img></div>`
      var item = [`${speaker.name}`, item.value, colors[i]]
      energy_params.push(item)
      var ttl = [`${speaker.name}`, item.value, colors[i]]
      i++
    }
    drawColumnChart(energy_params, "engagement-column", "Engagement", "Level")
  }else{
    $("#engagement-column").html("No data")
  }

  itemArr = window.results.speaker_insights.talkToListenRatio
  if (itemArr.length > 0){
    var ttl_params = [[ 'Speaker', 'Talk', 'Listen']];
    i = 0
    for (var item of itemArr){
      var speaker = speakersArr.find(o => o.id === item.speakerId)
      var ttlArr = item.value.split(":")
      var item = [`${speaker.name}`, parseInt(ttlArr[0]), parseInt(ttlArr[1])]
      ttl_params.push(item)
      i++
    }
    drawBarChart(ttl_params, "ttl-column", "TTL", "Level")
  }else{
    $("#ttl-column").html("No data")
  }
}

function setSpeakersWithSentiment(){
  speakerSentiment = $("#speakers").val()
  displayAnalytics('sentiment')
}
function displayConversations() {
  $("#text_block").hide()
  $("#conversations_block").show()
}

function displayAnalytics(option){
  $(`#${option}-tab`).addClass("tab-selected");
  $(`#${selectedOption}-tab`).removeClass("tab-selected");
  selectedOption = option
  if (option == 'task'){
    $("#analyzed_content").show();
    var itemArr = window.results.conversational_insights.tasks
    var text = "<div></div>"

    $("#analyzed_content").html(text)
  }else if (option == 'keyword'){
      var text = "";
      var itemArr = window.results.conversational_insights.keyPhrases
      for (var item of itemArr){
        console.log("key phrase item", item)
        var id = parseInt(item.start)
        text += `<span id="kw_${id}" class='keyword' onclick='jumpToPosition(${item.start})'> ${item.keyPhrase} </span>`
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
  }else if (option == 'topic'){
      var itemArr = window.results.conversational_insights.topics
      var text = ""
      for (var item of itemArr){
        var id = parseInt(item.start)
        text += `<div id="topic_${id}" class="keyword" onclick="jumpToPosition(${item.start})">${item.topic}</div>`
      }
      $("#analyzed_content").html(text)
  }else if (option == 'summary'){
      var itemArr = window.results.conversational_insights.extractiveSummary
      var text = ""
      for (var item of itemArr){
        var id = parseInt(item.start)
        text += `<div id="summary_${id}" class="analysis_brief" onclick="jumpToPosition(${item.start}, ${item.end})">${item.sentence}</div>`
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
  }else if (option == 'abstract'){
      var itemArr = window.results.conversational_insights.shortAbstract
      var text = "<h3>Short abstract</h3>"
      for (var item of itemArr){
        var id = parseInt(item.start)
        text += `<div id="sa_${id}" class="analysis_brief" onclick="jumpToPosition(${item.start}, ${item.end})">${item.text}</div>`
      }

      var itemArr = window.results.conversational_insights.longAbstract
      text += "<div><h3>Long abstract</h3></div>"
      for (var item of itemArr){
        var id = parseInt(item.start)
        text += `<div id="la_${id}" class="analysis_brief" onclick="jumpToPosition(${item.start}, ${item.end})">${item.text}</div>`
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
  }else if (option == 'question'){
      var itemArr = window.results.speaker_insights.questionsAsked
      var text = ''
      for (var item of itemArr){
        var speaker = speakersArr.find(o => o.id === item.speakerId)
        text += `<h3>${speaker.name}</h3>`
        for (var q of item.questions){
          var id = parseInt(q.start)
          text += `<div id="qs_${id}" class="analysis_brief" onclick="jumpToPosition(${q.start}, ${q.end})">${q.text}</div>`
        }
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
    }
}

function truncateText(text){
  var wordsArr = text.split(" ")
  var ret = ""
  if (wordsArr.length > TRUNCATE_LEN){
    for (var i=0; i<wordsArr.length; i++){
      if (i == TRUNCATE_LEN){
        ret += wordsArr[i] + " ..."
        break
      }
      ret += wordsArr[i] + " "
    }
  }else {
    ret = text
  }
  return ret
}
var editting = false
var edittingName = false
var oldParticipantName = ""
function enableEditParticipant(){
  var elem = document.getElementById('participant-field');
  if (edittingName){
    edittingName = false
    elem.disabled = true;
    var newName = elem.value
    if (oldParticipantName != newName){
      var field
      if (window.results.direction == "In")
        field = "from_name"
      else
        field = "to_name"
      setParticipantName(newName, field)
      $("#participant-field").attr("size", newName.length);
    }
    $("#edit-part-btn").attr("src","img/edit.png");
  }
  else{
    edittingName = true
    elem.disabled = false;
    elem.focus()
    oldParticipantName = elem.value
    $("#edit-part-btn").attr("src","img/accept.png");
  }
}
function setParticipantName(newName, field){
  var configs = {}
  configs['uid'] = window.results.uid
  configs['full_name'] = newName
  configs['field'] = field
  var url = "setfullname"
  var posting = $.post( url, configs )
  posting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{

    }
  });
    posting.fail(function(response){
      alert(response.statusText)
  });
}
var oldSubject = ""
function enableEditSubject(){
  var elem = document.getElementById('subject-field');
  if (editting){
    editting = false
    elem.disabled = true;
    var newSubject = elem.value
    if (oldSubject != newSubject){
      setSubject(newSubject)
      $("#subject-field").attr("size", newSubject.length);
    }
    $("#edit-btn").attr("src","img/edit.png");
  }
  else{
    editting = true
    elem.disabled = false;
    elem.focus()
    oldSubject = elem.value
    $("#edit-btn").attr("src","img/accept.png");
  }
}
function setSubject(newSubject){
  var configs = {}
  configs['uid'] = window.results.uid
  configs['subject'] = newSubject
  var url = "setsubject"
  var posting = $.post( url, configs )
  posting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{

    }
  });
    posting.fail(function(response){
      alert(response.statusText)
  });
}

var oldSpeakerName = ""
function enableEditSpeakerName(speakerId, buttonId){
  var id = `speaker-field-${speakerId}`
  var elem = document.getElementById(id);
  if (editting){
    editting = false
    elem.disabled = true;
    var newSpeakerName = elem.value
    if (oldSpeakerName != newSpeakerName){
      $(`#${id}`).attr("size", newSpeakerName.length);
      var item = speakersArr.find(o => o.id === speakerId)
      if (item){
        item.name = newSpeakerName
      }
      setSpeakerName()
      // update transcript
      displayMode = $("#transcript-mode").val() //(displayMode == 'block') ? 'utterance' : 'block'
      createConvoList()
      createSpeakerInsights()
      if (selectedOption == 'question')
        displayAnalytics(selectedOption)
    }
    $(`#${buttonId}`).attr("src","img/edit.png");
  }
  else{
    editting = true
    elem.disabled = false;
    elem.focus()
    elem.select()
    oldSpeakerName = elem.value
    $(`#${buttonId}`).attr("src","img/accept.png");
  }
}

function setSpeakerName(){
  var configs = {}
  configs['uid'] = window.results.uid
  configs['speakers'] = JSON.stringify(speakersArr)
  var url = "set-speakers"
  var posting = $.post( url, configs )
  posting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{

    }
  });
    posting.fail(function(response){
      alert(response.statusText)
  });
}

function drawColumnChart(params, graph, title, vTitle){
    console.log(params)
    var data = google.visualization.arrayToDataTable(params);
    var view = new google.visualization.DataView(data);
    view.setColumns([0, 1,
                    { calc: "stringify",
                       sourceColumn: 1,
                       type: "string",
                       role: "annotation"
                    }]);

    var options = {
      title: title,
      vAxis: {minValue: 0, title: `${vTitle}`},
      //hAxis: {format: 0},
      width: 280,
      height: 100,
      bar: {groupWidth: "60%"},
      legend: { position: "none" }
    };

    var chart = new google.visualization.ColumnChart(document.getElementById(graph));
    chart.draw(view, options);
}

function drawBarChart(params, graph, title, vTitle){
    var data = google.visualization.arrayToDataTable(params);
    var view = new google.visualization.DataView(data);
    view.setColumns([0, 1,
                    { calc: "stringify",
                       sourceColumn: 1,
                       type: "string",
                       role: "annotation"
                    },
                    2]);


    var options = {
          chart: {
            title: 'Talk to Listen Ratio',
            subtitle: 'Speaker, Talk, Listen'
          },
          width: 380,
          height: 100,
          bar: {groupWidth: "60%"},
          chartArea: {  width: "50%", height: "70%" }
        };

    var chart = new google.visualization.ColumnChart(document.getElementById(graph));
    chart.draw(view, options);
}

function initializeAudioPlayer(){
  wwoArr = window.results.wordsandoffsets
  //wordElm = document.getElementById("word0");
  //utteranceArr = window.results.utterance_insights
  //console.log(window.results.recording_url)
  //var urlArr = window.results.recording_url.split('?access_token=')
  wavesurfer = WaveSurfer.create({
    // Use the id or class-name of the element you created, as a selector
    container: '#waveform',
    // The color can be either a simple CSS color or a Canvas gradient
    // waveColor: linGrad,
    // progressColor: 'hsla(200, 100%, 30%, 0.5)',
    cursorColor: '#fff',
    backend: 'MediaElement', // This parameter makes the waveform look like SoundCloud's player
    barWidth: 2,
    barHeight: 4,
    barGap: 1,
    height: 30,
    fillParent: true,
    // maxCanvasWidth: 600,
    progressColor: '#0684bd',
    waveColor: '#ffffff',
    cursorWidth: 0,
    // normalize: true,
  });

  wavesurfer.setVolume(0.5);

  wavesurfer.load(window.results.recording_url);
  //wavesurfer.load('/proxyaudio?url=' + encodeURIComponent(urlArr[0]));
  audioPlayLine = document.getElementById("audio_play_line");
  wavesurfer.on('audioprocess', function () {
    var currentTime = wavesurfer.getCurrentTime();
    var duration = wavesurfer.getDuration();
    var percent = (currentTime * 100.0 /duration).toFixed(2);
    var style = 'linear-gradient(to right, transparent 0%, transparent ' + percent + '%, #c8ccd1 ' + percent + '%, #c8ccd1)';
    audioPlayLine.style.background = style;
    $('#audio-play-time').html(formatDuration(currentTime));
    seektimeupdate();
  });
  wavesurfer.on('play', function () {
    console.log("OnPlay()")
    $('#audio-play').hide();
    $('#audio-pause').show();
    seekEnded() // think better to be here
  });
  wavesurfer.on('ready', function () {
    $('#audio-play').show();
    $('#audio-pause').hide();
    var duration = wavesurfer.getDuration();
    $('#audio-duration').html(formatDuration(duration));
    $('#audio-play-time').html(formatDuration(0));
    audioLoaded();
  });
  wavesurfer.on('finish', function(seeking) {
    $('#audio-play').show();
    $('#audio-pause').hide();
    //seekEnded();
  });
  $('#audio-button').click(function() {
    if (wavesurfer.isPlaying()) {
      wavesurfer.pause();
      $('#audio-play').show();
      $('#audio-pause').hide();
    } else {
      wavesurfer.play();
      $('#audio-play').hide();
      $('#audio-pause').show();
    }
  });
  var sliderVolumeRange = document.getElementById("sliderVolumeRange");
  sliderVolumeRange.oninput = function() {
    var volume = this.value/1000.0;
    var percent = (volume * 100).toFixed(2);
    var style = 'linear-gradient(to right, #0684bd 0%, #0684bd ' + percent + '%, #c8ccd1 ' + percent + '%, #c8ccd1)';
    sliderVolumeRange.style.background = style;
    wavesurfer.setVolume(volume);
  }
}

function audioLoaded() {
    mIndex = 0;
}
function seekEnded_tbd() {
    var pos = wavesurfer.getCurrentTime();
    resetReadWords(pos);
    //jumpTo(pos, true)
    var id = "word" + mIndex;
    wordElm = document.getElementById(id);
}

function seekEnded() {
    console.log("Call resetReadWords from seekEnded")
    var pos = wavesurfer.getCurrentTime();
    resetReadWords(pos);
    var id = "word" + mIndex;
    wordElm = document.getElementById(id);

    var wordPos = $(wordElm).position().top
    if (wordPos < 0 || wordPos > conversationLastLine){
      console.log("SCROLL VIEW")
      $(wordElm)[0].scrollIntoView();
    }
}

function seektimeupdate() {
    var pos = wavesurfer.getCurrentTime();
    if (displayMode == 'paragraphs' || displayMode == 'transcripts'){
      if (mIndex < wwoArr.length) {
          var check = wwoArr[mIndex].offset;
          while (check >=0  && pos >= check){
            wordElm.setAttribute("class", "readtext");
            var wordPos = $(wordElm).position().top
            if (wordPos > conversationLastLine)
              $(wordElm)[0].scrollIntoView();
            wordElm = document.getElementById("word"+mIndex);
            wordElm.setAttribute("class", "word");
            mIndex++;
            check = wwoArr[mIndex].offset;
          }
          if (pos >= blockEndTimeStamp){
            wavesurfer.pause()
            blockEndTimeStamp = 10000000
          }
      }
    }else if (displayMode == 'utterances'){
      if (mIndex < utteranceArr.length) {
          var check = utteranceArr[mIndex].start;

          while (check >=0  && pos >= check){
            wordElm.setAttribute("class", "readtext");
            var wordPos = $(wordElm).position().top
            if (wordPos > conversationLastLine){
              $(wordElm)[0].scrollIntoView();
            }
            wordElm = document.getElementById(`word${mIndex}`);
            wordElm.setAttribute("class", "word");
            mIndex++;
            check = utteranceArr[mIndex].start;
          }
          if (pos >= blockEndTimeStamp){
            aPlayer.pause()
            blockEndTimeStamp = 10000000
          }
      }else{
        console.log("Where is mIndex", mIndex)
      }
      /*
      if (mIndex < utteranceArr.length) {
          var check = utteranceArr[mIndex].start;
          var end = utteranceArr[mIndex].end;
          while (check >=0  && pos >= check){
            wordElm.setAttribute("class", "readtext");
            var wordPos = $(wordElm).position().top
            if (wordPos > conversationLastLine)
              $(wordElm)[0].scrollIntoView();
            wordElm = document.getElementById("word"+mIndex);
            wordElm.setAttribute("class", "word");
            mIndex++;
            check = utteranceArr[mIndex] && utteranceArr[mIndex].start;
          }
          if (pos >= blockEndTimeStamp){
            wavesurfer.pause()
            blockEndTimeStamp = 10000000
          }
      }
      */
    }else{
      console.log("Not coming here")
    }
}

function resetReadWords(value) {
    var elm = null
    if (displayMode == 'paragraphs' || displayMode == 'transcripts'){
      for (var i=0; i<mIndex; i++) {
          var idee = "word" + i;
          elm = document.getElementById(idee);
          elm.setAttribute("class", "unreadtext");
      }
      mIndex = 0;
      var pos =  wwoArr[mIndex].offset;
      while (pos && pos < value) {
          var idee = "word" + mIndex;
          elm = document.getElementById(idee);
          elm.setAttribute("class", "readtext");
          mIndex++;
          pos =  wwoArr[mIndex] && wwoArr[mIndex].offset;
      }
    }else if (displayMode == "utterances"){
      for (var i=0; i<mIndex; i++) {
          var idee = "word" + i;
          elm = document.getElementById(idee);
          elm.setAttribute("class", "unreadtext");
      }
      mIndex = 0;
      var pos =  utteranceArr[mIndex].end;
      while (pos && pos < value) {
          var idee = "word" + mIndex;
          elm = document.getElementById(idee);
          elm.setAttribute("class", "readtext");
          mIndex++;
          pos =  utteranceArr[mIndex] && utteranceArr[mIndex].end;
      }
    }else{
      console.log("Not coming here! resetReadWords for transcripts mode");
    }
}
var currentSelectedBlock = ""

function findCurrentmIndex(){
  var pos = wavesurfer.getCurrentTime();
  var continuePlaying = false
  if (wavesurfer.isPlaying()) {
    wavesurfer.pause();
    continuePlaying = true
  }

  if (displayMode == 'paragraphs' || displayMode == 'transcripts'){
    for (var i=0; i<wwoArr.length; i++){
      if (wwoArr[i].offset >= pos){
        mIndex = i
        break
      }
    }
    //console.log("new word mIndex", mIndex)
  }else if (displayMode == "utterances"){ //uterance mode
    for (var i=0; i<utteranceArr.length; i++){
      if (utteranceArr[i].start >= pos){
        mIndex = i
        break
      }
    }
    //console.log("new utterance mIndex", mIndex)
  }else{
    console.log("Not coming here findCurrentmIndex");
  }
  resetReadWords(pos)
  if (continuePlaying)
    wavesurfer.play()
}

function jumpToPosition(timeStamp, endBlock){
  if (endBlock)
    blockEndTimeStamp = endBlock
  var id = parseFloat(timeStamp)
/*
  if (displayMode == 'utterances'){
    //mIndex = utteranceArr.findIndex(o => o.start == timeStamp)
    //findCurrentmIndex()
    var pos = wavesurfer.getCurrentTime();
    for (var i=0; i<utteranceArr.length; i++){
      if (utteranceArr[i].start >= pos){
        mIndex = i
        break
      }
    }
  }
*/
/*
  var idee = "word" + mIndex;
  wordElm = document.getElementById(`word${mIndex}`);
  jumpTo(timeStamp, true)
  if (currentSelectedBlock != "")
    $(`#${currentSelectedBlock}`).removeClass("block-selected");
  $(`#${id}`).addClass("block-selected");
  currentSelectedBlock = id
  //console.log("currentSelectedBlock", currentSelectedBlock)
*/
  console.log("current SelectedBlock", currentSelectedBlock)
  if (currentSelectedBlock != "")
    $(currentSelectedBlock).removeClass("block-selected");
  var id = parseInt(timeStamp)
  var block = `#block-${id}`
  $(block).addClass("block-selected");
  currentSelectedBlock = block
  console.log("new SelectedBlock", currentSelectedBlock)
  jumpTo(timeStamp, true)
}

function jumpToSentiment(timeStamp, sentence, words){
  sentence = unescape(sentence)
  words = unescape(words)
  //alert(words)
  //alert(timeStamp)
  var wordArr = words.split(" ")
  var sentenceArr = sentence.split(" ")
  for (var i=0; i<wwoArr.length; i++){
    var item = wwoArr[i]
    if (item.offset == timeStamp){
      var n = 0
      for (n=0; n<sentenceArr.length; n++){
        var matchArr = []
        for (var m=0; m<wordArr.length; m++){
          var cleanWord = sentenceArr[n+m].replace(/\b[.,!']+\B|\B[.,!']+\b/g,"")
          matchArr.push(cleanWord.trim())
          //matchArr.push(sentenceArr[n+m])
        }
        var match = matchArr.join(" ")
        //alert(match)
        if (match.indexOf(words) >= 0){
          timeStamp = wwoArr[n+i].offset
          //alert(wwoArr[startPos].word)
          jumpTo(timeStamp, true)
          return
        }
      }
    }
  }
}

function findSearchSentenceAndHighlight(sentence){
  var wordArr = sentence.split(" ")
  var cleanKeyword = sentence.replace(/\b[.,!'\?]+\B|\B[.,!'\?]+\b/g,"");
  let regEx = new RegExp(`\\b${cleanKeyword}\\b`, 'i');
  for (var i=mIndex; i<wwoArr.length; i++){
    var matchArr = []
    for (n=0; n<wordArr.length; n++){
      var m = i+n
      if (m < wwoArr.length - wordArr.length){
        var cleanWord = wwoArr[m].word.replace(/\b[.,!'\?]+\B|\B[.,!'\?]+\b/g,"")
        matchArr.push(cleanWord.trim())
      }else{
        break
      }
    }
    var match = matchArr.join(" ")
    if (regEx.test(match) || match.indexOf(cleanKeyword) == 0){
      var timeStamp = wwoArr[i].offset
      wavesurfer.play(timeStamp);
      wavesurfer.pause()
      return
    }
  }
  if (i >= wwoArr.length){
    for (var i=0; i<wwoArr.length; i++){
      var matchArr = []
      for (n=0; n<wordArr.length; n++){
        var m = i+n
        if (m < wwoArr.length - wordArr.length){
          var cleanWord = wwoArr[m].word.replace(/\b[.,!'\?]+\B|\B[.,!'\?]+\b/g,"")
          matchArr.push(cleanWord.trim())
        }else
          break
      }
      var match = matchArr.join(" ")
      if (regEx.test(match) || match.indexOf(cleanKeyword) == 0){
        var timeStamp = wwoArr[i].offset
        wavesurfer.play(timeStamp);
        wavesurfer.pause()
        break
      }
    }
  }
}

function jumpToKeyword(keyword){
  console.log("kw", keyword)
  var wordArr = keyword.split(" ")
  $("#search").val(keyword)
  $("#search").focus()
  var cleanKeyword = keyword.replace(/\b[.,!'\?]+\B|\B[.,!'\?]+\b/g,"");
  let regEx = new RegExp(`\\b${cleanKeyword}\\b`, 'i');
  for (var i=mIndex; i<wwoArr.length; i++){
    var matchArr = []
    for (n=0; n<wordArr.length; n++){
      var m = i+n
      if (m < wwoArr.length - wordArr.length){
        // replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"")
        // replace(/\b[-.,()&$#!\[\]{}"']+\B|\B[-.,()&$#!\[\]{}"']+\b/g, "");
        //alert(wwoArr[m].word)
        var cleanWord = wwoArr[m].word.replace(/\b[.,!'\?]+\B|\B[.,!'\?]+\b/g,"")
        //alert(cleanWord)
        matchArr.push(cleanWord.trim())
      }else{
        break
      }
    }
    var match = matchArr.join(" ")
    //alert("match: " + match)
    if (regEx.test(match) || match.indexOf(cleanKeyword) == 0){
      var timeStamp = wwoArr[i].offset
      jumpTo(timeStamp, true)
      return
    }
  }
  if (i >= wwoArr.length){
    for (var i=0; i<wwoArr.length; i++){
      var matchArr = []
      for (n=0; n<wordArr.length; n++){
        var m = i+n
        if (m < wwoArr.length - wordArr.length){
          var cleanWord = wwoArr[m].word.replace(/\b[.,!'\?]+\B|\B[.,!'\?]+\b/g,"")
          matchArr.push(cleanWord.trim())
        }else
          break
      }
      var match = matchArr.join(" ")
      if (regEx.test(match) || match.indexOf(cleanKeyword) == 0){
        var timeStamp = wwoArr[i].offset
        jumpTo(timeStamp, true)
        break
      }
    }
  }
}

function selectWord(){
  $("#search").select()
}

function searchForText(){
  var searchWord = $("#search").val()

  this.event.preventDefault();
  if (searchWord == "*")
    return
  //$("#search").focus()
  console.log(searchWord)
  jumpToKeyword(searchWord)
}

function jumpTo(timeStamp, scrollIntoView) {
  //aPlayer.currentTime = timeStamp;
  wavesurfer.pause();
  resetReadWords(timeStamp);
  //wavesurfer.play(timeStamp);
  //var id = "word" + mIndex;

  window.setTimeout(function(){
      wavesurfer.play(timeStamp);
    }, 1000)

/*
  wavesurfer.pause();
  resetReadWords(timeStamp);
  var id = "word" + mIndex;
  wordElm = document.getElementById(id);
  // aPlayer.currentTime = timeStamp;
  if (scrollIntoView){
    var elm = "#" + id
    $(elm)[0].scrollIntoView();
  }
  // David wants to have some delay to play on click. Keep this value
  window.setTimeout(function(){
    wavesurfer.play(timeStamp);
    //seekEnded() // either here or inside the play
  }, 800)
*/
}

function getInterestsRequestCallback(resp) {
    var data = JSON.parse(resp);
    if (data.length > 0)
    {
        var text = "<div>";
        for (var i=0; i< data.length; i++)
        {
            var entity = data[i];
            if (entity.type == "companies_eng")
            {
                text += "<b>Companiy name: </b><span style=\"color:#01A982 !important\"> " + entity.normalized_text + "</span></br>";
                if (entity.hasOwnProperty('additional_information'))
                {
                    var additional = entity.additional_information;
                    var url = "";
                    if (additional.hasOwnProperty('wikipedia_eng'))
                    {
                        text += "<b>Wiki page: </b><a href=\"";
                        if (additional.wikipedia_eng.indexOf("http") == -1)
                            url = "http://" + additional.wikipedia_eng;
                        else
                            url = additional.wikipedia_eng;
                        text += url + "\">";
                        text += url + "</a>";
                        text += "</br>";
                    }
                    if (additional.hasOwnProperty('url_homepage'))
                    {
                        text += "<b>Home page: </b><a href=\"";
                        if (additional.url_homepage.indexOf("http") == -1)
                            url = "http://" + additional.url_homepage;
                        else
                            url = additional.url_homepage;
                        text += url + "\">";
                        text += url + "</a>";
                        text += "</br>";
                    }
                    if (additional.hasOwnProperty('company_wikipedia'))
                    {
                        var wikiPage = "";
                        for (var p=0; p < additional.company_wikipedia.length; p++)
                            wikiPage += additional.company_wikipedia[p] + ", ";
                        if (wikiPage.length > 3)
                            wikiPage = wikiPage.substring(0, wikiPage.length - 2);
                        text += "<b>Wikipedia:</b> " + wikiPage + "</br>";
                    }
                    if (additional.hasOwnProperty('company_ric'))
                    {
                        var wikiPage = "";
                        for (var p=0; p<additional.company_ric.length; p++)
                            wikiPage += additional.company_ric[p] + ", ";
                        if (wikiPage.length > 3)
                            wikiPage = wikiPage.substring(0, wikiPage.length - 2);
                        text += "<b>RIC:</b> " + wikiPage + "</br>";
                    }
                }
            }
            else if (entity.type == "places_eng")
            {
                text += "<div style=\"color:#01A982 !important\">Place name: " + entity.normalized_text + "</div>";
                if (entity.hasOwnProperty('additional_information')) {
                    var url = "";
                    var additional = entity.additional_information;
                    if (additional.hasOwnProperty('place_population'))
                    {
                        var pop = parseFloat(additional.place_population, 2);
                        var population = numberWithCommas(pop);// pop.toString();
                        /*
                        if (pop > 1000000)
                        {
                            pop /= 1000000;
                            population = pop.toString() + " million";
                        }
                        */

                        text += "<b>Population:</b> " + population + "</br>";
                    }
                    if (additional.hasOwnProperty('image'))
                    {
                        text += "<img src=\"";
                        text += additional.image + "\" width=\"50%\"/>";
                        text += "</br>";
                    }
                    if (additional.hasOwnProperty('wikipedia_eng'))
                    {
                        text += "<b>Wiki page: </b><a target='_blank' href=\"";
                        if (additional.wikipedia_eng.indexOf("http") == -1)
                            url = "http://";
                        else
                            url = additional.wikipedia_eng;
                        text += url + "\">";
                        text += url + "</a>";
                        text += "</br>";
                    }
                    if (additional.lat != 0.0 && additional.lon != 0.0)
                    {
                        var zoom = "10z";
                        if (additional.hasOwnProperty('place_type'))
                        {
                            switch (additional.place_type)
                            {
                                case "region1":
                                    zoom = ",6z";
                                    break;
                                case "continent":
                                    zoom = ",5z";
                                    break;
                                case "area":
                                    zoom = ",7z";
                                    break;
                                case "country":
                                    zoom = ",4z";
                                    break;
                                case "populated place":
                                    zoom = ",10z";
                                    break;
                                default:
                                    zoom = ",12z";
                                    break;
                            }
                        }
                        text += "<b>Map: </b><a target='_blank' href=\"https://www.google.com/maps/@" + additional.lat + "," + additional.lon + zoom + "\">";
                        text += "Show map</a></br>";
                    }
                }
            }
            else if (entity.type == "people_eng")
            {
                text += "<div style=\"color:#01A982 !important\">People name: " + entity.normalized_text + "</div>";

                if (entity.hasOwnProperty('additional_information'))
                {
                    var additional = entity.additional_information;
                    if (additional.hasOwnProperty('person_profession'))
                    {
                        var prof = "";
                        for (var p=0; p < additional.person_profession.length; p++)
                            prof += additional.person_profession[p] + ", ";
                        if (prof.length > 3)
                            prof = prof.substring(0, prof.length - 2);
                        text += "<b>Profession:</b> " + prof + "</br>";
                    }
                    if (additional.hasOwnProperty('person_date_of_birth'))
                        text += "<b>DoB:</b> " + additional.person_date_of_birth + "</br>";
                    if (additional.hasOwnProperty('person_date_of_death'))
                        text += "<b>DoD:</b> " + additional.person_date_of_death + "</br>";
                    if (additional.hasOwnProperty('image'))
                    {
                        text += "<img src=\"";
                        text += additional.image + "\" width=\"50%\"/>";
                        text += "</br>";
                    }
                    if (additional.hasOwnProperty('wikipedia_eng'))
                    {
                        var url = "";
                        text += "<b>Wiki page: </b><a href=\"";
                        if (additional.wikipedia_eng.indexOf("http") == -1)
                            url = "http://";
                        else
                            url = additional.wikipedia_eng;
                        text += url + "\">";
                        text += url + "</a>";
                        text += "</br>";
                    }
                }
            }
            else if (entity.type == "drugs_eng")
            {
                text += "<div style=\"color:#01A982 !important\">Drugs: " + entity.original_text + "</div>";
                if (entity.hasOwnProperty('additional_information')) {
                    var additional = entity.additional_information;
                    if (additional.hasOwnProperty('wikipedia_eng')) {
                        var url = "";
                        text += "<b>Wiki page: </b><a href=\"";
                        if (additional.wikipedia_eng.indexOf("http") == -1)
                            url = "http://";
                        else
                            url = additional.wikipedia_eng;
                        text += url + "\">";
                        text += url + "</a>";
                        text += "</br>";
                    }
                    if (additional.hasOwnProperty('disease_icd10')) {
                        var temp = "";
                        for (var p = 0; p < additional.disease_icd10.length; p++)
                            temp += additional.disease_icd10[p] + ", ";
                        if (temp.length > 3)
                            temp = temp.substring(0, temp.length - 2);
                        text += "<b>Disease:</b> " + temp + "</br>";
                    }
                }
            } else if (entity.type == "medical_conditions") {
                text += "<div style=\"color:#01A982 !important\">Medical condition: " + entity.original_text + "</div>";
                if (entity.hasOwnProperty('additional_information')) {
                    var additional = entity.additional_information;
                    if (additional.hasOwnProperty('wikipedia_eng')) {
                        var url = "";
                        text += "<b>Wiki page: </b><a target='_blank' href=\"";
                        if (additional.wikipedia_eng.indexOf("http") == -1)
                            url = "http://";
                        else
                            url = additional.wikipedia_eng;
                        text += url + "\">";
                        text += url + "</a>";
                        text += "</br>";
                    }
                    if (additional.hasOwnProperty('disease_icd10')) {
                        for (var p = 0; p < additional.disease_icd10.length; p++) {
                            text += "<b>ICD-10: </b><a target='_blank' href=\"";
                            text += additional.disease_icd10[p] + "\">";
                            text += "link</a>";
                            text += "</br>";
                        }
                    }
                }
            }
            text += "<br/>";
        }
        text += "</div>";
        $('#analytics_block').html(text);
    }
}
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function padLeft(input, char, length) {
  var str = `${input}`;
  var padding = [];
  for (var i = str.length; i < length; i += 1) {
    padding.push(char);
  }
  return padding.join('') + str;
}
function formatDuration(duration) {
  if (Number.isNaN(duration)) {
    return '--:--';
  }
  var intDuration = typeof duration === 'number' ?
    Math.round(duration) :
    parseInt(duration, 10);

  var seconds = padLeft(intDuration % 60, '0', 2);
  var minutes = padLeft(Math.floor(intDuration / 60) % 60, '0', 2);
  var hours = Math.floor(intDuration / 3600) % 24;
  var string = '';
  if (hours > 0) {
    string = string + padLeft(hours, '0', 2)   + ':';
  }
  string = string + minutes + ':' + seconds;
  return string;
}
