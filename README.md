# Smart-transcription-demo

This demo app shows you how to read RingCentral voice call and meeting recordings and call the RingCentral AI API to transcribe and analyze conversational insights from the conversations.

RingCentral AI API is in Beta and can be accessed via sending a request to the [RingCentral developer support channel](https://developers.ringcentral.com/support/create-case).

RingCentral AI API is not supported under the sandbox environment. Thus, you must have a RingCentral production account to build this demo app. You should follow the following step to create an app, then send the app client id in the API access request mentioned above.

## Create a RingCentral app
Login your RingCentral developer account at https://developers.ringcentral.com and create an app with the following requirements:
- Platform Type: "Browser-based"
- Grant Type: "Authorization Code"
- Scopes: ReadCallLog - ReadCallRecording - Video - ReadAccounts - WebhookSubscriptions

## Clone the project and Setup

```
git clone https://github.com/PacoVu/ringcentral-supervision-demo
cd ringcentral-supervision-demo
$ npm install --save
cp dotenv .env
```

Edit `.env` to specify credentials.

- `PORT`=3000
- `PGHOST`=Your local Postgres host (e.g. localhost)
- `PGUSER`=Your Postgres user name
- `PGDATABASE`=Your Postgres database name
- `PGPASSWORD`=Your Postgres password
- `PGPORT`=Your Postgres port (e.g. 5432)

- `DELIVERY_MODE_ADDRESS`=https://c6ea-73-170-xx-xx.ngrok-free.app/webhooks
- `DELIVERY_MODE_TRANSPORT_TYPE`=WebHook
- `WEBHOOK_EXPIRES_IN`=3600
- `RCAI_WEBHOOK_ADDRESS`=https://c6ea-73-170-xx-xx.ngrok-free.app/rc_ai_callback


- `CLIENT_ID_PROD`=Your-App-Client-Id
- `CLIENT_SECRET_PROD`=Your-App-Client-Secret

- `RC_APP_SERVER_URL_PROD`=https://platform.ringcentral.com
- `RC_APP_REDIRECT_URL`=http://localhost:3000/oauth2callback

## Run the demo
Open 2 terminal windows and run the following command

Ngrok tunnel
```
$ cd smart-transcription-demo
$ ngrok http 3000
```
Copy the ngrok address and specify it in the .env as follow:

`DELIVERY_MODE_ADDRESS`=https://xxxx-xx-xxx-xx-xx.ngrok-free.app/webhooks
`RCAI_WEBHOOK_ADDRESS`=https://xxxx-xx-xxx-xx-xx.ngrok-free.app/rc_ai_callback

Start the app
```
$ cd smart-transcription-demo
$ node index.js
```

## Test

- Open a browser and enter 'localhost:3000'.
- Login the app with your RingCentral production user credentials.
- Select the "Speaker Enrollment" page and follow the instructions on the page to enroll your speaker id.
- Select the "Imports" page and set the date form - date to range and click the "Read Call Recordings" or the "Read Meeting Recordings". If you don't have any call/meeting recordings, make a call to your RingCentral phone number and record the call.
- Select the "Data List" page and click on a call/meeting record item to start the transcription process
