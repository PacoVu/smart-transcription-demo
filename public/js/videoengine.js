window.onload = init;
const TRUNCATE_LEN = 9
var aPlayer = null;
var index = 0;
var mIndex = 1;
var wwoArr = [];
var utteranceArr = []
var wordElm = null;
var searchWordArr = new Array();

var speakerSentiment = -1
var foundIndex = 0;
var positiveThreshold = 0.5;
var negativeThreshold = -0.5;
var fixedSubstractedHeight = 0;

const RIGHT_BLOCK_OFFSET = 190 // 170
const LEFT_BLOCK_OFFSET = 520 // 150
var conversationLastLine = 0;
var transcriptFontSize = 14;
var selectedOption = ''
var blockEndTimeStamp = 10000000

let speakersArr = []
var displayMode = 'paragraphs'

function init() {
  google.charts.load('current', {'packages':['corechart'], callback: onGloaded});
  fixedSubstractedHeight = $("#menu_header").height()
  fixedSubstractedHeight += $("#subject_header").height()
  fixedSubstractedHeight += $("#record_info_line").height()
  //fixedSubstractedHeight += $("#footer").height()

  var h = $(window).height() - (fixedSubstractedHeight);

  $("#conversations_block").height(h - RIGHT_BLOCK_OFFSET);
  $("#analyzed_content").height(h - LEFT_BLOCK_OFFSET);
  h -= RIGHT_BLOCK_OFFSET
  conversationLastLine = $("#conversations_block").position().top + (h - 20);
  /*
  $("#analyzed_content")
  var sliderPos = document.getElementById("positiveSentimentRange");
  sliderPos.oninput = function() {
    positiveThreshold = this.value/1000;
    $("#posval").html(positiveThreshold);
    var percent = (positiveThreshold * 100).toFixed(2);
    var style = 'linear-gradient(to right, #b8e986 0%, #b8e986 ' + percent + '%, #c8ccd1 ' + percent + '%, #c8ccd1)';
    sliderPos.style.background = style;
    displayAnalytics('keyword');
  }

  var sliderNeg = document.getElementById("negativeSentimentRange");
  sliderNeg.oninput = function() {
      negativeThreshold = (this.value/1000) * -1;
      $("#negval").html(negativeThreshold)
      var percent = (this.value/10).toFixed(2);
      var style = 'linear-gradient(to right, #e98f86 0%, #e98f86 ' + percent + '%, #c8ccd1 ' + percent + '%, #c8ccd1)';
      sliderNeg.style.background = style;
      displayAnalytics('sentiment');
  }
  */
  $("#search").focus()
  //displayAnalytics('keywords');
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
  //console.log("speakersArr", window.results.speakers)
  displayAnalytics('abstract')
  initializeAudioPlayer()

  for (var utterance of window.results.utterance_insights){
    utteranceText = utterance.text.trim()
    if (utteranceText != "")
      utteranceArr.push(utterance)
  }
  createConvoList()

}

function onGloaded(){
  createSpeakerInsights()
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
      width: 320,
      height: 100,
      bar: {groupWidth: "60%"},
      chartArea: {  width: "50%", height: "70%" }
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
    console.log(newSpeakerName)
    if (oldSpeakerName != newSpeakerName){
      $(`#${id}`).attr("size", newSpeakerName.length);
      var item = speakersArr.find(o => o.id === speakerId)
      if (item){
        item.name = newSpeakerName
      }
      console.log(speakersArr)
      setSpeakerName()
      // update transcript
      //displayMode = (displayMode == 'block') ? 'utterance' : 'block'
      displayMode = $("#transcript-mode").val()
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
        if (item.keyPhrase != "class" && item.keyPhrase != 'keywords'){
          //text += "<span class='keyword' onclick='jumpToKeyword(\"" + item.keyword + "\")'>" + item.keyword + "</span>"
          var id = parseInt(item.start)
          console.log("kw id", id)
          text += `<div id="block-${id}" class='keyword' onclick='jumpToPosition(${item.start})'> ${item.keyPhrase} </div>`
        }
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
  }else if (option == 'topic'){
      /*
      var itemArr = window.results.conversational_insights.topics
      var text = ""
      for (var item of itemArr){
        text += `<div class="keyword">${item.topic}</div>`
      }
      $("#analyzed_content").html(text)
      */
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
        text += `<div id="block-${id}" class="analysis_brief" onclick="jumpToPosition(${item.start}, ${item.end})">${item.sentence}</div>`
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
  }else if (option == 'abstract'){
      var itemArr = window.results.conversational_insights.shortAbstract
      var text = "<h3>Short abstract</h3>"
      for (var item of itemArr){
        var id = parseInt(item.start)
        text += `<div id="block-${id}" class="analysis_brief" onclick="jumpToPosition(${item.start}, ${item.end})">${item.text}</div>`
      }

      var itemArr = window.results.conversational_insights.longAbstract
      text += "<div><h3>Long abstract</h3></div>"
      for (var item of itemArr){
        var id = parseInt(item.start)
        text += `<div id="block-${id}" class="analysis_brief" onclick="jumpToPosition(${item.start}, ${item.end})">${item.text}</div>`
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
          text += `<div id="block-${id}" class="analysis_brief" onclick="jumpToPosition(${q.start}, ${q.end})">${q.text}</div>`
        }
      }
      currentSelectedBlock = ""
      $("#analyzed_content").html(text)
    }
}

function truncateText(text){
  var wordsArr = text.split(" ");
  var ret = "";
  if (wordsArr.length > TRUNCATE_LEN){
    for (var i=0; i<wordsArr.length; i++){
      if (i == TRUNCATE_LEN){
        ret += wordsArr[i] + " ...";
        break
      }
      ret += wordsArr[i] + " ";
    }
  }else {
    ret = text;
  }
  return ret;
}

var isPlaying = false;
var progress;
var progressBar;
var videoSliderVolumeRange;
function initializeAudioPlayer(){
  wwoArr = window.results.wordsandoffsets;
  wordElm = document.getElementById("word0");
  aPlayer = document.getElementById("audio_player");
  progress = document.getElementById("video-progress");
  progressBar = document.getElementById('progress-bar');
  aPlayer.addEventListener("timeupdate", function() {
    seektimeupdate();
    if (!progress.getAttribute('max')) {
      progress.setAttribute('max', aPlayer.duration);
    }
    progress.value = aPlayer.currentTime;
    progressBar.style.width = Math.floor((aPlayer.currentTime / aPlayer.duration) * 100) + '%';
    $('#video-playing-time').html(formatDuration(aPlayer.currentTime))
  }, false);
  aPlayer.addEventListener('loadeddata', audioLoaded, false);
  aPlayer.addEventListener('seeked', seekEnded, false);
  aPlayer.addEventListener('loadedmetadata', function() {
    progress.setAttribute('max', aPlayer.duration);
    $('#video-duration').html(formatDuration(aPlayer.duration));
    $('#audio_player').css('height', 'auto');
  });
  isPlaying = false;
  $('#video-play').show();
  aPlayer.addEventListener('pause', function () {
    isPlaying = false;
    $('#video-pause').hide();
    $('#video-play').show();
  });
  aPlayer.addEventListener('ended', function () {
    isPlaying = false;
    $('#video-pause').hide();
    $('#video-play').show();
  });
  aPlayer.addEventListener('play', function () {
    isPlaying = true;
    $('#video-pause').show();
    $('#video-play').hide();
  });
  $('#video-pause').click(function() {
    if (isPlaying) {
      isPlaying = false;
      aPlayer.pause();
      $('#video-pause').hide();
      $('#video-play').show();
    }
  });
  $('#video-play').click(function() {
    if (!isPlaying) {
      isPlaying = true;
      aPlayer.play();
      $('#video-pause').show();
      $('#video-play').hide();
    }
  });
  progress.addEventListener('click', function(e) {
    var pos = (e.pageX  - (this.offsetLeft + this.offsetParent.offsetLeft)) / this.offsetWidth;
    aPlayer.currentTime = pos * aPlayer.duration;
  });
  videoSliderVolumeRange = window.document.getElementById("videoSliderVolumeRange");
  $('#volume-icon').click(function () {
    $('#videoSliderVolumeRange').toggle();
  });
  videoSliderVolumeRange.oninput = function() {
    var percent = (this.value/10).toFixed(2);
    var style = 'linear-gradient(to right, #ffffff 0%, #ffffff ' + percent + '%, #888888 ' + percent + '%, #888888)';
    videoSliderVolumeRange.style.background = style;
    aPlayer.volume = this.value / 1000.0;
  }
  $('#fullscreen-icon').click(function() {
    if (aPlayer.requestFullscreen) {
      aPlayer.requestFullscreen();
    } else if (aPlayer.mozRequestFullScreen) {
      aPlayer.mozRequestFullScreen();
    } else if (aPlayer.webkitRequestFullScreen) {
      aPlayer.webkitRequestFullScreen();
    }
  });

  //document.getElementById("audio_player").addEventListener('webkitfullscreenchange', onFullScreen)
  document.getElementById("audio_player").addEventListener('fullscreenchange', onFullScreen)

}

function onFullScreen(e) {
  enableCC = !enableCC
  if (enableCC){
    $("#close-caption").show()
    getTranscriptLine()
  }else{
    $("#close-caption").hide()
    seekEnded()
  }
}

const MAX_WORDS_LENGTH = 15
var updateLine = MAX_WORDS_LENGTH
var enableCC = false
var ccWord = document.getElementById("w0");
function getTranscriptLine(){
  var startPos = mIndex
  var stopPos = (mIndex >= (wwoArr.length - MAX_WORDS_LENGTH)) ? mIndex : mIndex + MAX_WORDS_LENGTH
  var transcriptLine = ""
  updateLine = 0
  for (var i=0; i<MAX_WORDS_LENGTH; i++){
    //transcriptLine += wwoArr[startPos].word + " "
    if ((mIndex + i) < wwoArr.length){
      $("#w" + i).html(wwoArr[mIndex+i].word)
    }else{
      console.log("empty?")
      $("#w" + i).html("")
    }
    //ccWord = document.getElementById("w"+i);
    //ccWord.setAttribute("class", "");
  }
  //$("#w" + i).html(transcriptLine)
  //ccWord = document.getElementById("w0");
}

function audioLoaded() {
    mIndex = 0;
    //upperBlockHeight = $("#upper_block").height()
    console.log("audio loaded?")
    //displayAnalytics('abstract');
}
function seekEnded() {
    console.log("Call resetReadWords from seekEnded")
    var pos = aPlayer.currentTime;
    resetReadWords(pos);
    wordElm = document.getElementById(`word${mIndex}`);
    var wordPos = $(wordElm).position().top
    if (wordPos < 0 || wordPos > conversationLastLine){
      console.log("SCROLL VIEW")
      $(wordElm)[0].scrollIntoView();
    }
}

// CC w/o highlight text
function seektimeupdate() {
  var pos = aPlayer.currentTime;
  if (enableCC){
    if (mIndex < wwoArr.length){
      var check = wwoArr[mIndex].offset;
      if (pos >= check){
        mIndex++;
        check = wwoArr[mIndex].offset;
        updateLine++
        console.log("updateLine", updateLine)
        if (updateLine >= MAX_WORDS_LENGTH)
          getTranscriptLine()
      }
    }
  }else{
    var pos = aPlayer.currentTime
    if (displayMode == 'paragraphs' || displayMode == 'transcripts'){
      if (mIndex < wwoArr.length) {
          var check = wwoArr[mIndex].offset;
          while (check >=0  && pos >= check){
            wordElm.setAttribute("class", "readtext");
            var wordPos = $(wordElm).position().top
            if (wordPos > conversationLastLine){
              $(wordElm)[0].scrollIntoView();
            }
            wordElm = document.getElementById("word"+mIndex);
            wordElm.setAttribute("class", "word");
            mIndex++;
            check = wwoArr[mIndex] && wwoArr[mIndex].offset;
          }
          if (pos >= blockEndTimeStamp){
            aPlayer.pause()
            blockEndTimeStamp = 10000000
          }
      }
    }else{
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
    }
  }
}

/*
// CC with highlight text
function seektimeupdate() {
  var pos = aPlayer.currentTime;
  if (enableCC){
    if (mIndex < wwoArr.length){

      var check = wwoArr[mIndex].offset;
      if (pos >= check){
        ccWord.setAttribute("class", "readtext");
        ccWord = document.getElementById("w"+updateLine);
        ccWord.setAttribute("class", "spoken-word");
        mIndex++;
        check = wwoArr[mIndex].offset;
        updateLine++
        if (updateLine >= MAX_WORDS_LENGTH)
          getTranscriptLine()
      }
    }
  }else{
    if (mIndex < wwoArr.length){
      var check = wwoArr[mIndex].offset;
      while (pos >= check){
        wordElm.setAttribute("class", "readtext");
        var wordPos = $(wordElm).position().top
        if (wordPos > conversationLastLine)
          $(wordElm)[0].scrollIntoView();
        wordElm = document.getElementById("word"+mIndex);
        wordElm.setAttribute("class", "word");
        mIndex++;
        check = wwoArr[mIndex].offset;
      }
    }
  }
}
*/
/*
// no CC
function seektimeupdate() {
    var pos = aPlayer.currentTime;
    if (mIndex < wwoArr.length)
    {
        var check = wwoArr[mIndex].offset;
        while (pos >= check)
        {
            wordElm.setAttribute("class", "readtext");
            var wordPos = $(wordElm).position().top
            if (wordPos > conversationLastLine)
              $(wordElm)[0].scrollIntoView();
            wordElm = document.getElementById("word"+mIndex);
            wordElm.setAttribute("class", "word");
            mIndex++;
            check = wwoArr[mIndex].offset;
        }
    }
}
*/


function resetReadWords(value) {
    var elm;
    console.log("resetReadWords", displayMode, value, mIndex)
    //if (displayMode == 'block'){
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
    }else{ // Utterances
      for (var i=0; i<mIndex; i++) {
          var idee = "word" + i;
          elm = document.getElementById(idee);
          elm.setAttribute("class", "unreadtext");
      }
      mIndex = 0;
      var pos =  utteranceArr[mIndex].start;
      while (pos && pos < value) {
          var idee = "word" + mIndex;
          elm = document.getElementById(idee);
          elm.setAttribute("class", "readtext");
          mIndex++;
          pos =  utteranceArr[mIndex] && utteranceArr[mIndex].start;
      }
    }
}

var currentSelectedBlock = ""
function findCurrentmIndex(){
  console.log("findCurrentmIndex")
  var pos = aPlayer.currentTime;
  console.log('before', isPlaying)
  if (isPlaying)
    aPlayer.pause()
  //console.log("current mIndex and time offset", mIndex, pos)
  //if (displayMode == 'block'){
  if (displayMode == 'paragraphs' || displayMode == 'transcripts'){
    for (var i=0; i<wwoArr.length; i++){
      if (wwoArr[i].offset >= pos){
        mIndex = i
        break
      }
    }
    //console.log("new word mIndex", mIndex)
  }else{ //uterance mode
    for (var i=0; i<utteranceArr.length; i++){
      if (utteranceArr[i].start >= pos){
        mIndex = i
        break
      }
    }
    //console.log("new utterance mIndex", mIndex)
  }
  console.log("call resetReadWords from findCurrentmIndex")
  resetReadWords(pos)
  console.log('after', isPlaying)
  if (isPlaying){
    window.setTimeout(function(){
      aPlayer.play();
    }, 1000)
  }
    //aPlayer.play()
}

function jumpToPosition(timeStamp, endBlock){
  if (endBlock)
    blockEndTimeStamp = endBlock
/*
  if (displayMode == 'utterances'){
    //mIndex = utteranceArr.findIndex(o => o.start == timeStamp)
    //findCurrentmIndex()
    var pos = aPlayer.currentTime;
    for (var i=0; i<utteranceArr.length; i++){
      if (utteranceArr[i].start >= pos){
        mIndex = i
        break
      }
    }
  }
*/
  //var idee = "word" + mIndex;
  //wordElm = document.getElementById(idee);
  //jumpTo(timeStamp, true)
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
        }
        var match = matchArr.join(" ")
        if (match.indexOf(words) >= 0){
          timeStamp = wwoArr[n+i].offset
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
      aPlayer.currentTime = timeStamp;
      aPlayer.pause()
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
        aPlayer.currentTime = timeStamp;
        aPlayer.pause()
        break
      }
    }
  }
}
function jumpToKeyword(keyword){
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
  jumpToKeyword(searchWord)
}

function jumpTo(timeStamp, scrollIntoView) {
  aPlayer.currentTime = timeStamp;
  var id = "word" + mIndex;
  window.setTimeout(function(){
      aPlayer.play();
    }, 1000)
/*
  return

  //if (isPlaying)
  //  aPlayer.pause();
  console.log("Call resetReadWords from jumpTo")
  resetReadWords(timeStamp);
  var id = "word" + mIndex;
  wordElm = document.getElementById(id);

  if (scrollIntoView){
    var elm = "#" + id
    console.log("SCROLL TO VIEW:", elm)
    $(elm)[0].scrollIntoView();
  }

  aPlayer.currentTime = timeStamp;
  window.setTimeout(function(){
    aPlayer.play();
  }, 1000)
*/
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
