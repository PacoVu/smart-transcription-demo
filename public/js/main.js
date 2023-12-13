var deleteArray = new Array()
var isExtensionsChanged = false
var transcribingArr = []

function initForReadLog() {
  $( "#fromdatepicker" ).datepicker({ dateFormat: "yy-mm-dd"});
  $( "#todatepicker" ).datepicker({dateFormat: "yy-mm-dd"});
  var pastMonth = new Date();
  var day = pastMonth.getDate()
  var month = pastMonth.getMonth() - 1
  var year = pastMonth.getFullYear()
  if (month < 0){
    month = 11
    year -= 1
  }
  $( "#fromdatepicker" ).datepicker('setDate', new Date(year, month, day));
  $( "#todatepicker" ).datepicker('setDate', new Date());
}
function initForRecordedCalls() {
  //console.log(window.calls)
  var height = $("#menu_header").height()
  height += $("#search_bar").height()
  height += $("#call_list_header").height()
  height += $("#footer").height()

  var h = $(window).height() - (height + 125);
  $("#call_items").height(h)

  window.onresize = function() {
    var height = $("#menu_header").height()
    height += $("#search_bar").height()
    height += $("#call_list_header").height()
    height += $("#footer").height()

    var h = $(window).height() - (height + 125);
    $("#call_items").height(h)
  }

  if (window.navigator.userAgent.indexOf('Win') > -1) {
    var list = window.document.getElementById('call_items');
    /*if (list.scrollHeight > list.offsetHeight) {
      $('.sentiment_icon_td').css('padding-left', '23px');
    }*/
  }

  $('#call_items').find('.subject_edit_icon').click(function (e) {
    e.stopPropagation();
    var textElem = $(this).parent().find('span');
    var inputElem = $(this).parent().find('input');
    var uid = $(this).data('uid');
    if ($(this).attr('src').indexOf('edit') > -1) {
      textElem.hide();
      inputElem.show();
      $(this).attr("src", "img/accept.png");
    } else {
      textElem.show();
      inputElem.hide();
      if (inputElem.val() !== textElem.text()) {
        textElem.html(inputElem.val());
        var posting = $.post( "setsubject", {
          uid: uid,
          subject: inputElem.val()
        });
        posting.done(function( response ) {
          var res = JSON.parse(response)
          if (res.status == "error") {
            alert(res.calllog_error)
          }
        });
        posting.fail(function(response){
          alert(response.statusText)
        });
      }
      $(this).attr("src", "img/edit.png");
    }
  });

  $('#call_items').find('.subject_edit_input').click(function(e) {
    e.stopPropagation();
  });

  $('#call_items').find('.subject_edit_input').click(function(e) {
    e.stopPropagation();
  });

  $('#call_items').find('.record-selection').click(function(e) {
    e.stopPropagation();
  });

  $('#call_items').find('tr').click( function() {
    var index = $(this).index()
    if (window.calls[index].processed == 1){
      var isKeyword = $(this).find('.transcript_brief').find('.keyword').length > 0;
      var searchWord;
      if (!isKeyword) {
        //searchWord = $(this).find('.transcript_brief').data('original-text').replace('...', '').trim();
        searchWord = $(this).find('.transcript_brief').data('original-text').trim();
      }
      openAnalyzed(window.calls[index].uid, searchWord)
    }else if (window.calls[index].processed == 0) {
      var r = confirm("This content has not been transcribed yet.Do you want to transcribe it now?");
      if (r == true) {
        $(`#pi_${window.calls[index].uid}`).css('display', 'inline-block');
        transcribe(window.calls[index].uid, window.calls[index].call_type, window.calls[index].recording_url)
        window.calls[index].processed = 2
      }
    }else{
      var r = confirm("Transcribing is in progress. Do you want to cancel the transcribing process?");
      if (r == true) {
        cancelTranscribe(window.calls[index].uid)
      }else{
        if (checkTimer == null){
          //transcribingArr.push(window.calls[index].uid)
          startPolling(window.calls[index].uid)
          //startPolling()
        }else {
          /* underdevelopment
          var i = transcribingArr.findIndex(window.calls[index].uid)
          if (i >= 0)
            transcribingArr.splice(i, 1)
          */
          window.clearInterval(checkTimer)
          checkTimer = null
        }
      }
    }
  });

  $("#search").focus()
  $("#search").select()
  $('#extensionnumbers').on('hidden.bs.select', function () {
    if (window.location.pathname === "readlog") {
      return;
    }
    if (isExtensionsChanged) {
      startSearch();
    }
  });
  for (var item of window.calls){
    if (item.processed == 2){
      startPolling(item.uid)
      $(`#pi_${item.uid}`).css('display', 'inline-block');
    }
  }
}
function selectionHandler(elm){
  if ($(elm).prop("checked")){
    deleteArray = []
    for (var item of calls){
      var eid = "#sel_"+ item.uid
      $(eid).prop('checked', true);
      var item = {}
      item['id'] = item.uid
      item['type'] = item.type
      item['rec_id'] = item.rec_id
      deleteArray.push(item)
    }
  }else{
    for (var item of window.calls){
      var eid = "#sel_"+ item.uid
      $(eid).prop('checked', false);
    }
    deleteArray = []
  }
}

function selectSelectText(){
  $("#search").select()
}

function openAnalyzed(id, searchWord){
  var search = $("#search").val()
  post_to_url('/analyze', {
    CallId: id,
    searchWord: searchWord ? searchWord : search,
    searchArg: search
  }, 'post');
}

function post_to_url(path, params, method) {
    method = method || "post";
    var form = document.createElement("form");
    form.setAttribute("method", method);
    form.setAttribute("action", path);
    for(var key in params) {
        if(params.hasOwnProperty(key)) {
            var hiddenField = document.createElement("input");
            hiddenField.setAttribute("type", "hidden");
            hiddenField.setAttribute("name", key);
            hiddenField.setAttribute("value", params[key]);

            form.appendChild(hiddenField);
         }
    }
    document.body.appendChild(form);
    form.submit();
}

function readCallLogs(e){

  $("#fromdatepicker").prop("disabled", true);
  $("#todatepicker").prop("disabled", true);
  $("#readcalllogs").prop("disabled", true);
  $("#logginIcon").css('display', 'inline');
  let offset = new Date().getTimezoneOffset(); // 480 //
  let utcOffset = offset * 60000
  var localFromTime = $("#fromdatepicker").val() + "T00:00:00.001Z"
  var localToTime = $("#todatepicker").val() + "T23:59:59.999Z"
  var utcFromTimestamp = new Date(localFromTime).getTime() + utcOffset
  var utcToTimestamp = new Date(localToTime).getTime() + utcOffset
  var configs = {}
  configs['dateFrom'] = new Date(utcFromTimestamp).toISOString() //$("#fromdatepicker").val() + "T00:00:00.001Z"
  //var gmtTime = $("#todatepicker").val()

  configs['dateTo'] = new Date(utcToTimestamp).toISOString() //$("#todatepicker").val() + "T23:59:59.999Z"
  /*
  if ($('#extensionids') != undefined) {
    configs['extensionList'] = JSON.stringify($('#extensionids').val());
  }else{
    configs['extensionList'] = [];
  }
  */
  //alert(JSON.stringify(configs))
  var url = "readlogs"
  var posting = $.post( url, configs );
  posting.done(function( response ) {
    //var res = JSON.parse(response)
    console.log(response)
    $("#logginIcon").css('display', 'none');
    if (response.status != "ok") {
      alert(response.message)
    }else{
      window.location = "/recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText);
  });
  e.preventDefault();
}

function readMeetings(e){
  $("#fromdatepicker").prop("disabled", true);
  $("#todatepicker").prop("disabled", true);
  $("#readcalllogs").prop("disabled", true);
  $("#logginIcon").css('display', 'inline');
  var configs = {}
  configs['dateFrom'] = $("#fromdatepicker").val() + "T00:00:00.001Z"
  var gmtTime = $("#todatepicker").val()
  //alert(gmtTime)
  //return
  configs['dateTo'] = $("#todatepicker").val() + "T23:59:59.999Z"

  var url = "read-meetings"
  var posting = $.post( url, configs );
  posting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status != "ok") {
      alert(res.calllog_error)
    }else{
      window.location = "recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText);
  });
  e.preventDefault();
}


function enableNotification(e){
  if ($('#notification_btn').text() == "Disable Auto Processing"){
    var url = "disablenotification"
    var getting = $.get( url );
    getting.done(function( response ) {
      //var res = JSON.parse(response)
      console.log("disable", response.status)
      if (response.status != "ok") {
        console.log(response.message)
      }else{
        $('#notification_btn').text("Enable Auto Processing")
      }
    });
    getting.fail(function(response){
      alert(response.statusText);
    });
  }else{
    var url = "enablenotification"
    var configs = {}
    if ($('#extensionids') != undefined) {
      configs['extensionList'] = JSON.stringify($('#extensionids').val());
    }else{
      configs['extensionList'] = [];
    }
    var posting = $.post(url, configs);
    posting.done(function( response ) {
      //var res = JSON.parse(response)
      console.log("enable", response.status)
      if (response.status != "ok") {
        alert(response.message)
      }else{
        $('#notification_btn').text("Disable Auto Processing")
      }
    });
    posting.fail(function(response){
      alert(response.statusText);
    });
  }
  e.preventDefault();
}

function startSearch(){
  $("#searchForm").submit()
  this.event.preventDefault();
}

function transcribe(audioId, type, recordingUrl){
  //transcribingArr.push(audioId)
  $('#ts_' + audioId).hide()
  $(`#pi_${audioId}`).css('display', 'inline-block');

  var configs = {}
  configs['uid'] = audioId
  configs['type'] = type
  configs['recordingUrl'] = recordingUrl
  //configs['fname'] = fileName
  console.log(configs)
  var url = "transcribe"
  disableAllInput(true)
  var posting = $.post( url, configs );
  posting.done(function( response ) {
    //alert(res)
    disableAllInput(false)
    var res = JSON.parse(response)
    if (res.status == "failed") {
      alert(res.message + " Please try again!")
    }else if (res.status == "empty") {
      $('#tt_' + audioId).html("Cannot recognize any text from this call.")
    }else if (res.status == "ok"){
      var itemArr = JSON.parse(res.result.keywords)
      //alert(JSON.stringify(itemArr))
      var count = itemArr.length
      var keywords = ""
      for (var i=0; i < count; i++) {
        var item = itemArr[i]
        //alert(JSON.stringify(item))
        keywords += '<span class="keyword">' + item.text + '</span>'
        if (i > 4) {
          break
        }
      }
      //var icon = 'img/'
      //icon += res.result.sentiment + '.png'
      //$('#pi_' + audioId).hide()
      $(`#pi_${item.uid}`).css('display', 'none');
      //$('#st_' + audioId).attr("src", icon);
      $('#tt_' + audioId).html(keywords)
      $('#ts_' + audioId).html(res.result.subject)
      $('#ts_' + audioId).show()
    } else if (res.status == "in_progress"){
      // should poll or ask user to mamually check?
      $('#tt_' + audioId).html(res.message)
      startPolling(res.uid)
      //startPolling()
    }
  });
  posting.fail(function(response){
    disableAllInput(false)
    alert(response.statusText);
  });
}
var checkTimer = null

function startPolling(uid){
  var thisUID = uid
  var thisText = "Transcribing ..."
  checkTimer = window.setInterval(function (){
    var url = "checktranscription?uid="+thisUID
    var getting = $.get( url );
    getting.done(function( response ) {
      var res = JSON.parse(response)
      if (res.status != "ok") {
        alert(res.status)
      }else{
        if (res.state == '1'){
          clearInterval(checkTimer)
          checkTimer = null
          window.location = "recordedcalls"
        }else if (res.state == '2'){
          thisText += "."
          if (thisText.length > 30)
            thisText = "Transcribing ..."
          //$('#pi_' + thisUID).show()
          $('#tt_' + thisUID).html(thisText)
        }else{
          clearInterval(checkTimer)
          checkTimer = null
          thisText = "Transcribe failed. Please try again."
          $('#tt_' + thisUID).html(thisText)
          $(`#pi_${thisUID}`).css('display', 'none');
        }
      }
    });
    getting.fail(function(response){
      clearInterval(checkTimer)
      alert(response.statusText);
    });
  }, 5000)
}
function cancelTranscribe(uid){
  var url = "canceltranscription?uid="+uid
  var getting = $.get( url );
  getting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status != "ok") {
      alert(res.status)
    }else{
      window.location = "recordedcalls"
    }
  });
  getting.fail(function(response){
    alert(response.statusText);
  });
}

function startPolling_new_underdevelopment(){
  var thisUID = uid
  var thisText = "Transcribing ..."
  checkTimer = window.setInterval(function (){

    var url = `checktranscription?uids=${transcribingArr.join(';')}`
    var getting = $.get( url );
    getting.done(function( response ) {
      var res = JSON.parse(response)
      if (res.status != "ok") {
        alert(res.status)
      }else{
        if (res.state == '1'){
          clearInterval(checkTimer)
          checkTimer = null
          window.location = "recordedcalls"
        }else{
          thisText += "."
          if (thisText.length > 30)
            thisText = "Transcribing ..."
          //$('#pi_' + thisUID).show()
          $('#tt_' + thisUID).html(thisText)
        }
      }
    });
    getting.fail(function(response){
      clearInterval(checkTimer)
      alert(response.statusText);
    });
  }, 5000)
}
function cancelTranscribe_new_underdevelopment(uid){
  var url = "canceltranscription?uid="+uid
  var getting = $.get( url );
  getting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status != "ok") {
      alert(res.status)
    }else{
      window.location = "recordedcalls"
    }
  });
  getting.fail(function(response){
    alert(response.statusText);
  });
}

function disableAllInput(disable){
  var elems = document.getElementsByTagName('button');
  var len = elems.length;
  if (disable == true){
    for (var i = 0; i < len; i++) {
        elems[i].disabled = true;
    }
  }else{
    for (var i = 0; i < len; i++) {
        elems[i].disabled = false;
    }
  }
}

function confirmRemove(id){
  var r = confirm("Do you really want to remove this call from local database?");
  if (r == true) {
    removeFromLocalDB(id)
  }
}

function removeFromLocalDB(id){
  var configs = {}
  configs['id'] = id
  var url = "remove"
  var posting = $.post(url, configs)
  posting.done(function(response) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert("error")
    }else{
      window.location = "recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText)
  });
}

function confirmDelete(id, type, rec_id) {
  var r = confirm("Do you really want to delete this call from RingCentral call log database?");
  if (r == true) {
    deleteFromDB(id, type, rec_id)
  }
}

function deleteFromDB(id, type, rec_id){
  var configs = {}
  configs['id'] = id
  configs['type'] = type
  configs['rec_id'] = rec_id
  var url = "delete-single"
  var posting = $.post(url, configs)
  posting.done(function(response) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{
      window.location = "recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText)
  });
}

function findSimilar(id){
  var configs = {}
  configs['id'] = id
  var url = "findsimilar"
  var posting = $.post(url, configs)
  posting.done(function(response) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{
      alert("ok")
    }
  });
  posting.fail(function(response){
    alert(response.statusText)
  });
}

function selectForDelete(elm, cid, type, rec_id){
  var eid = "#sel_"+cid
  if ($(eid).prop("checked")){
    var item = {}
    item['id'] = cid
    item['type'] = type
    item['rec_id'] = rec_id
    deleteArray.push(item)
  }else{
    for (var i = 0; i < deleteArray.length; i++){
      if (deleteArray[i].id == cid){
        deleteArray.splice(i, 1)
        break
      }
    }
  }
  //this.event.preventDefault();
  /*
  var rem = document.getElementById("rem_btn");
  var del = document.getElementById("del_btn");
  if (deleteArray.length > 0){
    //rem.disabled = true
    //del.disabled = true
    //$("#rem_btn").prop("")
    $("#rem_btn").prop("disabled", false);
    $("#del_btn").prop("disabled", false);
  }else{
    //rem.disabled = false
    //del.disabled = false
    $("#rem_btn").prop("disabled", true);
    $("#del_btn").prop("disabled", true);
  }
  */
}
function confirmRemoveSelectedItemsFromDB(){
  var r = confirm("Do you really want to remove selected calls from local database?");
  if (r == true) {
    removeSelectedItemsFromLocalDB()
  }
}

function confirmDeleteSelectedItemsFromCallLogDb(){
  if (deleteArray.length <= 0 )
    return
  var r = confirm("Do you really want to delete selected calls from RingCentral call log database?");
  if (r == true) {
    deleteSelectedItemsFromCallLogDb()
  }
}

function removeSelectedItemsFromLocalDB(){
  var configs = {}
  configs['calls'] = JSON.stringify(deleteArray)
  var url = "delete-multiple"
  var posting = $.post(url, configs)
  posting.done(function(response) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert("error")
    }else{
      window.location = "recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText)
  });
}

function deleteSelectedItemsFromCallLogDb(){
  var configs = {}
  configs['calls'] = JSON.stringify(deleteArray)
  var url = "delete"
  var posting = $.post(url, configs)
  posting.done(function(response) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{
      window.location = "recordedcalls"
    }
  });
  posting.fail(function(response){
    alert(response.statusText)
  });
}

function extensionsChanged(e) {
  isExtensionsChanged = true
}

//
var fileName = ""
function loadCRAudioFile(el) {
  fileName = el.files[0].name
}

function loadPrerecordedAudioFile(el){
  fileName = el.files[0].name
}
function processSelectedAudioFile(){
  if (fileName.length == 0)
    return
  var configs = {}
  configs['fname'] = fileName
  var type = ''
  if (fileName.indexOf('.mp3') > 0)
    type = 'ULC'
  else if (fileName.indexOf('.mp4') > 0)
    type = 'ULV'
  else {
    return
  }
  configs['type'] = type
  configs['fromRecipient'] = "Unknown #"
  configs['toRecipient'] = "Unknown #"
  configs['extensionNum'] = "103"
  configs['fullName'] = "Paco Vu"
  configs['date'] = new Date().getTime() / 1000
  var url = "createrecord"
  var posting = $.post( url, configs )
  posting.done(function( response ) {
    var res = JSON.parse(response)
    if (res.status == "error") {
      alert(res.calllog_error)
    }else{
        window.location = "recordedcalls"
      }
    });
    posting.fail(function(response){
      alert(response.statusText)
    });
}
