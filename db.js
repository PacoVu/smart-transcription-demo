var async = require("async");
require('dotenv').load()

const { Pool, Client } = require('pg')
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
})

module.exports = {
  createTableAsync:  async function(table){
    var index = table.indexOf("rcai_user_")
    var query = `CREATE TABLE IF NOT EXISTS ${table}`
    if (index >= 0){
      query += ' (uid BIGINT PRIMARY KEY, rec_id VARCHAR(64) NOT NULL, call_date BIGINT NOT NULL, call_type VARCHAR(3) NOT NULL, host JSONB NOT NULL, participants JSONB NOT NULL, recording_url VARCHAR(256) NOT NULL, duration INT DEFAULT 0, direction VARCHAR(3) NOT NULL, processed INT NOT NULL, wordsandoffsets JSON NOT NULL, transcript TEXT NOT NULL, conversations JSONB NOT NULL, conversational_insights JSONB NOT NULL, utterance_insights JSONB NOT NULL, speaker_insights JSONB NOT NULL, subject VARCHAR(256) NOT NULL, speakers JSONB NOT NULL)'
    }else if (table == "rcai_users"){
      query += ' (ext_id BIGINT PRIMARY KEY, acct_id VARCHAR(20) NOT NULL, sub_id VARCHAR(64) NOT NULL, tokens JSONB NOT NULL, full_name VARCHAR(128) NOT NULL, main_company_number VARCHAR(16) NOT NULL)'
    }else if (table == "inprogressed_transcription"){
      query += ' (transcript_id VARCHAR(40) PRIMARY KEY, item_id BIGINT NOT NULL, ext_id BIGINT NOT NULL, audio_src TEXT NOT NULL)'
    }
    try {
      var response = await pool.query(query);
      return response;
    } catch (error) {
      return null
    }
  },
  createIndex: (query, callback) => {
    return pool.query(query, callback);
  },
  delete_table:(query, callback) => {
    return pool.query(query, callback)
  },
  end_transaction: () => {
    pool.end();
  },
  insert_row: (query, values, callback) => {
    return pool.connect((err, client, done) => {
      const shouldAbort = (err) => {
        if (err) {
          console.error('Error in transaction', err.stack)
          client.query('ROLLBACK', (err) => {
            if (err) {
              console.error('Error rolling back client', err.stack)
            }
            // release the client back to the pool
            done()
          })
        }
        return !!err
      }
      client.query('BEGIN', (err) => {
        if (shouldAbort(err)) return
        client.query(query, values, (err, res) => {
          if (shouldAbort(err)) return
          client.query('COMMIT', (err) => {
            if (err) {
              console.error('Error committing transaction', err.stack)
            }
            done()
          })
        })
      })
    })
  },

  read: (query, callback) => {
    return pool.query(query, callback)
  },
  readAsync: async function(query){
    let response;
    try {
      response = await pool.query(query);
      return response;
    } catch (error) {
      // handle error
      // do not throw anything
      return null
    }
  },
  update: (query, callback) => {
    return pool.query(query, callback)
  },
  updateAsync: async function(query) {
    var response;
    try {
      response = await pool.query(query);
      return response;
    } catch (error) {
      return null
    }
  },
  insert: (query, params, callback) => {
    return pool.query(query, params, callback)
  },
  insertAsync: async function (query, params) {
    var response;
    try {
      response = await pool.query(query, params);
      return response;
    } catch (error) {
      return null
    }
  },
  remove:(query, callback) => {
    return pool.query(query, callback)
  },
  removeAsync: async function (query) {
    var response;
    try {
      response = await pool.query(query);
      return response;
    } catch (error) {
      return null
    }
  }
}
