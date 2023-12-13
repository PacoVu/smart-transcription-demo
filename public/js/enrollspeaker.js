var blob = undefined
function init(){
  readEnrollment()
  //$("#enroll-btn").attr("disabled", true);
  $("#startRecord").css("color", "white");
  $("#delete-btn").css("display", "none");
}

var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

navigator.mediaDevices.getUserMedia({audio:true})
.then(stream => {handlerFunction(stream)})

function handlerFunction(stream) {
  console.log("Call this function?")
  rec = new MediaRecorder(stream);
  rec.ondataavailable = e => {
    audioChunks.push(e.data);
    if (rec.state == "inactive"){
      if (isSafari){
        blob = new Blob(audioChunks,{type:'audio/mpeg3;audio/x-mpeg-3'});
        //let playBlob = new Blob(audioChunks,{type:'audio/webm'});
        //recordedAudio.src = URL.createObjectURL(blob);
      }else{
        blob = new Blob(audioChunks,{type:'audio/webm'}); //new Blob(audioChunks,{type:'audio/mpeg-3'});
        //recordedAudio.src = URL.createObjectURL(blob);
      }
      recordedAudio.src = URL.createObjectURL(blob);
      recordedAudio.controls=true;
      recordedAudio.autoplay=true;
      $("#enroll-btn").css("display", "block");
      //$("#delete-btn").css("display", "block");
      }
    }
}



function startRecording(){
    $("#startRrecord").attr("disabled", true);
    $("#startRecord").css("backgroundColor", "red");
    $("#startRecord").css("color", "white");
    $("#stopRecord").attr("disabled", false);
    audioChunks = [];
    rec.start();
}

function stopRecording(){
  $("#startRrecord").attr("disabled", false);
  $("#stopRecord").attr("disabled", true);
  $("#startRecord").css("backgroundColor", "green");
  rec.stop();

}

function startEnrollment(){
  var data = new FormData();
  data.append('file', blob, `${window.extensionId}-recorded.webm`);
  $.ajax({
         url : '/start-enrollment',
         type : 'POST',
         data : data,
         processData: false,  // tell jQuery not to process the data
         contentType: false,  // tell jQuery not to set contentType
         success : function(res) {
           console.log(res)
           if (res.status == "ok") {
             console.log(res.data)
             updateEnrollmentData(res.data)
             $("#startRrecord").attr("disabled", false);
             $("#stopRecord").attr("disabled", true);
             $("#startRecord").css("backgroundColor", "green")
             $("#delete-btn").css("display", "block");
           }else if (res.status == "processing") {
             $("#enrollment-info").html("Processing!")
             var source = document.getElementById("recordedAudio").src;
             source.src = ``
             //$("#enroll-btn").attr("disabled", true);
             $("#delete-btn").css("display", "none");
             window.setTimeout(function (){
               readEnrollment()
             }, 10000)
           }else if (res.status == "failed"){
             $("#enrollment-info").html("Failed. Recording too long!")
             alert(res.message)
             var source = document.getElementById("recordedAudio").src;
             source.src = ``
             //$("#enroll-btn").attr("disabled", true);
             $("#delete-btn").css("display", "block");
             window.setTimeout(function (){
               readEnrollment()
             }, 10000)
           }else{
             console.log(res)
             alert(res.message)
           }
         }
  });
}

function readEnrollment(){
  console.log("readEnrollment")
  var getting = $.get( 'enrollment' );
  getting.done(function( res ) {
    console.log("Res", res)
    console.log("Data", res.data)
    if (res.status == "ok") {
      console.log(res.data)
      updateEnrollmentData(res.data)
      $("#startRrecord").attr("disabled", false);
      $("#stopRecord").attr("disabled", true);
      $("#startRecord").css("backgroundColor", "green")
      $("#delete-btn").css("display", "block");
    }else if (res.status == "processing"){
      $("#enrollment-info").html("Processing!")
      //$("#enroll-btn").attr("disabled", true);
      //$("#delete-btn").css("display", "none");
      window.setTimeout(function (){
        readEnrollment()
      }, 5000)
    }else if (res.status == "notfound"){
      $("#enrollment-info").html("Not enrolled!")
      $("#delete-btn").css("display", "none");
      window.setTimeout(function (){
        readEnrollment()
      }, 30000)
    }else if (res.status == "failed"){
      //$("#enrollment-info").html("Failed. Recording too long!")
      $("#delete-btn").css("display", "none");
      $("#enrollment-info").html(res.message)
      var source = document.getElementById("recordedAudio").src;
      source.src = ``
      //$("#enroll-btn").attr("disabled", true);
      //$("#delete-btn").css("display", "block");
      window.setTimeout(function (){
        readEnrollment()
      }, 3000)
    }else{
      alert("err")
    }
  });
}

function deleteEnrollment(){
  console.log("deleteEnrollment")
  var getting = $.get( 'delete-enrollment' );
  getting.done(function( res ) {
    if (res.status == "ok") {
      updateEnrollmentData(res.data)
    }else if (res.status == "notfound"){
      $("#enrollment-info").html("Not enrolled!")
      $("#delete-btn").css("display", "none");
    }else{
      alert("err")
    }
  });
}

function updateEnrollmentData(data){
  var html = "<ul>"
  var spId = (data.speakerId) ? data.speakerId : data.enrollmentId
  html += `<li>Speaker Id: ${spId}</li>`
  html += `<li>Enrollment Complete:  ${data.enrollmentComplete}</li>`
  html += `<li>Total Speech Duration: ${data.totalSpeechDuration.toFixed(2)}</li>`
  html += `<li>Total Enrollment Duration: ${data.totalEnrollDuration.toFixed(2)}</li>`
  html += `<li>Enrollment Quality: ${data.enrollmentQuality}</li>`
  html += "</ul>"
  $("#enrollment-info").html(html)
}

function showSampleText(){
  if($("#sample-text").is(":visible")){
    //$("sample-text-btn").value = "Show sample text"
    $("#sample-text-btn").prop('value', 'Show sample text');
    $("#sample-text").hide()

  } else{
    //$("sample-text-btn").value = "Hide sample text"
    $("#sample-text-btn").prop('value', 'Hide sample text');
    $("#sample-text").show()
  }
}
