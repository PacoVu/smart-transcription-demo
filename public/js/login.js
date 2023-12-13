var OAuthCode = function(authUri, redirectUri) {
    this.loginPopup  = function() {
      this.loginPopupUri(authUri, redirectUri);
    }
    this.loginPopupUri  = function(authUri, redirectUri) {
      var win         = window.open(authUri, 'windowname1', 'width=800, height=600');
      var pollOAuth   = window.setInterval(function() {
        try {
          if (win.document.URL.indexOf(redirectUri) != -1) {
            console.log(win.document.URL)
            window.clearInterval(pollOAuth);
            win.close();
            let offset = new Date().getTimezoneOffset(); // 480 //
            let utcOffset = offset * 60000
            window.setTimeout(function() {
              window.location.href = `/readlog?utcOffset=${utcOffset}`
            }, 3000)
          }
        } catch(e) {
          console.log(e)
      }
    }, 100);
  }
}

function login() {
  var oauth = new OAuthCode(window.RC_AUTHORIZE_URI, window.RC_APP_REDIRECT_URL);
  oauth.loginPopup()
}

function chooseEnvironment(){
  window.location.href = "login"
}
