// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object.
const bcrypt = require('bcrypt'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server
const { channel } = require('diagnostics_channel');
//const firebase = require('firebase/app');
//const fireAuth = require('firebase/auth');
//require('');
// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials',
});

function onSignIn(googleUser) {
    var profile = googleUser.getBasicProfile();
    console.log('ID: ' + profile.getId()); // Do not send to your backend! Use an ID token instead.
    console.log('Name: ' + profile.getName());
    console.log('Image URL: ' + profile.getImageUrl());
    console.log('Email: ' + profile.getEmail()); // This is null if the 'email' scope is not present.
  }
  

// database configuration
const dbConfig = {
    host: 'db', // the database server
    port: 5432, // the database port
    database: process.env.POSTGRES_DB, // the database name
    user: process.env.POSTGRES_USER, // the user account to connect with
    password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test your database
db.connect()
    .then(obj => {
        console.log('Database connection successful'); // you can view this message in the docker compose logs
        obj.done(); // success, release the connection;
    })
    .catch(error => {
        console.log('ERROR:', error.message || error);
    });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

// initialize session variables
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        saveUninitialized: false,
        resave: false,
    })
);

app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);

// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************

// potentially needed for testin
const videoIds = [];
//const nextToken = undefined;

app.get('/', (req, res) => {
    res.redirect('login');
});

app.get('/login', (req, res) => {
    res.render('pages/login')
});
app.post('/login', async (req, res) => {
    try {
        // get user from table
        const user = await db.oneOrNone(`SELECT * FROM users WHERE username = $1`, req.body.username);

        // if user does not exist in database
        if (!user) {
            //console.log('user not pass!!!!!!!!!!!!!! ------------------------');
            return res.status(400).render('pages/register');
        }

        // get password then compare to see if they match
        const pass = await bcrypt.compare(req.body.password, user.password);
        // redirect to login and send message
        if (!pass) {
            //console.log('pass not pass!!!!!!!!!! ---------------------------');
            return res.status(400).render('pages/login');
        }
        //console.log('LOGIN PASS!!!!!!!! ---------------------------');
        // save user in session variable
        req.session.user = user;
        req.session.save();
        

        res.redirect('/home');
    } catch (error) {
        console.log(error);
        res.status(500).render('/login');
    }
});

  // function for getting channel id from handle, which we could make people set their handle to.
  // basically, possible way to make application mostly work even if we don't get authentication working.
  async function getChannelID(handle) { 
    try {
      let results = await axios({
          url: `https://www.googleapis.com/youtube/v3/channels`,
          method: 'GET',
          dataType: 'json',
          headers: {
            'Accept-Encoding': 'application/json',
          },
          params: {
            part: 'id', //what sort of data you want returned, i think?
            forHandle: handle, //put channel name/handle here, duh. should fetch from user on log in?
            key: process.env.API_KEY,
          },
        })
  
        //console.log(results.data); // the results will be displayed on the terminal if the docker containers are running // Send some parameters
        //console.log(results.data.items[0].id);
        return results.data.items[0].id;
      }
      catch (error) {
        res.status(500).json({
          error,
        });
      }
  
  }
  

app.get('/register', (req, res) => {
    res.render('pages/register');
});

app.post('/register', async (req, res) => {
    try{
        var id = await getChannelID(req.body.username);
        console.log(id);
        if (req.body.username == req.body.password || id == undefined) {
            return res.status(400).render('pages/register');
        }
        //hash the password using bcrypt library
        const hash = await bcrypt.hash(req.body.password, 10);
        const query = 'INSERT INTO users (username,password) VALUES ($1,$2)';
        const val = [req.body.username,hash ];
        await db.query(query, val);
        //redirects to login if success 
        res.redirect('/login');
    }

    catch (err) {
        res.redirect('/register');
  }
});

// -------------------------------------------AUTH MIDDLEWARE-------------------------------------

const auth = (req, res, next) => {
  if (!req.session.user) {
    // Default to login page.
    return res.redirect('/login');
  }
  next();
};

// Authentication Required
app.use(auth);


async function manyCalls(array, nextToken, id) {
  console.log('manycalls');
  let arr = array;
  while(nextToken) {
      let values = await axios({
          url: `https://www.googleapis.com/youtube/v3/activities`,
          method: 'GET',
          dataType: 'json',
          headers: {
            'Accept-Encoding': 'application/json',
          },
          params: {
            part: 'contentDetails,snippet', //what sort of data you want returned, i think?
            channelId: id,
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
            pageToken: nextToken
          },
        })
        
        values.data.items.forEach(item => {
          if(item.contentDetails.playlistItem && item.contentDetails.playlistItem.resourceId.kind == 'youtube#video') {
            let vid = {
              id:item.contentDetails.playlistItem.resourceId.videoId,
              snippet: item.snippet,
              channel: item.snippet.channelId
            };
            arr.push(vid);
          }
        });
    nextToken = values.data.nextPageToken;
  }
  return arr;
}
async function manyChCalls(array, nextToken) { //for channel stats page.
  let ourId = await getChannelID(req.session.user.username);
  console.log('manychcalls');
  while(nextToken) {
      console.log('manychloop');
      if (!nextToken || nextToken == undefined) { return array; }
      let values = await axios({
          url: `https://www.googleapis.com/youtube/v3/activities`,
          method: 'GET',
          dataType: 'json',
          headers: {
            'Accept-Encoding': 'application/json',
          },
          params: {
            part: 'contentDetails', //what sort of data you want returned, i think?
            channelId: ourId,
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
            pageToken: nextToken
          },
        })
        for(let j = 0; j<values.data.items.length; j++) {
          if (values.data.items[j].contentDetails.subscription) {
              console.log('CONFIRMED');
              /*vid = {
                id: values.data.items[j].contentDetails.playlistItem.resourceId.videoId,
                snippet: undefined,
                channel: undefined
              };
              array.push(vid);*/
          }
        }
    nextToken = values.data.nextPageToken;
  }
  return array;
}
async function vidCall(array, info, count, nextToken) { //was originally going to get highest rated from this, but you need to have auth for that
  console.log('vidcall');
  let first = count*50
  let ids = array[first].id;
  for (let i = first+1; i < Math.min(first+50, array.length); i++) {
      ids = ids.concat(',', array[i].id);
  }
  var values;
  if (nextToken != undefined){
    values = await axios({
        url: `https://www.googleapis.com/youtube/v3/videos`,
        method: 'GET',
        dataType: 'json',
        headers: {
        'Accept-Encoding': 'application/json',
        },
        params: {
        part: 'snippet,statistics', //what sort of data you want returned, i think?
        id: ids,
        key: process.env.API_KEY,
        maxResults: 50,//array.length, // you can choose the max number of things you would like to return
        pageToken: nextToken
        },
    })
  }
  else {
    values = await axios({
      url: `https://www.googleapis.com/youtube/v3/videos`,
      method: 'GET',
      dataType: 'json',
      headers: {
      'Accept-Encoding': 'application/json',
      },
      params: {
      part: 'snippet,statistics', //what sort of data you want returned, i think?
      id: ids,
      key: process.env.API_KEY,
      maxResults: 50,//array.length, // you can choose the max number of things you would like to return
      },
    })
  }
        
  for(let i = 0; i < Math.min(50, array.length-first); i++) {
    var vid = {
        id: array[i].id,
        snippet: values.data.items[i].snippet,
        channel: values.data.items[i].snippet.channelId,
        stats: values.data.items[i].statistics
    };
    info.push(vid);
  }

  if(values.data.nextPageToken != undefined) {
    count++;
    nextToken = values.data.nextPageToken;
    info = vidCall(array, info, count, nextToken);
  }
  else {
    return info;
  }
}


async function getFreqVid(array) {
  if (array.length == 0) {return 0;}
  let arr = array.sort((c1, c2) => (c1.id < c2.id) ? 1 : (c1.id > c2.id) ? -1 : 0);

  let count = {id: arr[0].id, count: 0};
  let temp = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i].id == arr[i+1].id) {
      temp++;
      if (temp > count.count) {
        count.id = arr[i].id;
        count.count = temp;
      }
    }
    else {
      temp = 0;
    }
  }
  return count.id;
};

async function getFreqChannel(array){
  if (array.length == 0) {return 0;}
  let arr = array.sort((c1, c2) => (c1.channel < c2.channel) ? 1 : (c1.channel > c2.channel) ? -1 : 0);

  let count = {id: arr[0].id, count: 1, channel: arr[0].channel};
  let temp = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i].channel == arr[i+1].channel) {
      temp++;
      if (temp > count.count) {
        count.channel = arr[i].channel;
        count.count = temp;
      }
    }
    else {
      temp = 0;
    }
  }
  try {
    let values = await axios({
      url: `https://www.googleapis.com/youtube/v3/channels`,
      method: 'GET',
      dataType: 'json',
      headers: {
        'Accept-Encoding': 'application/json',
      },
      params: {
        part: 'snippet', //what sort of data you want returned, i think?
        id: count.channel,
        key: process.env.API_KEY,
        maxResults: 50, // you can choose the max number of things you would like to return
      },
    })
    let channel = {
      id: values.data.items[0].id,
      snippet: values.data.items[0].snippet
    };
    return channel;
  }
  catch {
    return undefined;
  }
};

app.get('/home', async(req, res) => {
  let ourId = await getChannelID(req.session.user.username);
  try {
      let values = await axios({
          url: `https://www.googleapis.com/youtube/v3/activities`,
          method: 'GET',
          dataType: 'json',
          headers: {
            'Accept-Encoding': 'application/json',
          },
          params: {
            
            part: 'contentDetails,snippet', //what sort of data you want returned, i think?
            channelId: ourId,
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
          },
        })
        let idArray = [];
        
        if (values.data.items.length == undefined || values.data.items.length == 0) {
          res.status(500).json({
              error,
          });
          res.render('pages/home', {
              results: [],
              error: true,
              message: error.message,
          });
          return;
        } 

        values.data.items.forEach(item => {
          if(item.contentDetails.playlistItem && item.contentDetails.playlistItem.resourceId.kind == 'youtube#video') {
            let vid = {
              id:item.contentDetails.playlistItem.resourceId.videoId,
              snippet: undefined,
              channel: undefined,
              stats: undefined
            };
            idArray.push(vid);
          }
        });
        
        var temp = [];
        temp = await manyCalls(idArray, values.data.nextPageToken, ourId);

        var info = [];        
        info = await vidCall(temp, info, 0);
        
        var freqVid = await getFreqVid(info);
        var mostWatched = info.find(vid => vid.id == freqVid);
        var freqCh = await getFreqChannel(info);

        res.render('pages/home', {
          info,
          mostWatched,
          freqCh,
          message: 'happy happy happy',
        });
        
  }
  catch (error) {
      res.status(500).json({
          error,
      });
      res.render('pages/home', {
          results: [],
          error: true,
          message: error.message,
      });
  }
});

app.get('/vidStats', async(req, res) => {
  let ourId = await getChannelID(req.session.user.username);
  try {
      let values = await axios({
          url: `https://www.googleapis.com/youtube/v3/activities`,
          method: 'GET',
          dataType: 'json',
          headers: {
            'Accept-Encoding': 'application/json',
          },
          params: {
            
            part: 'contentDetails', //what sort of data you want returned, i think?
            channelId: ourId,
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2020-01-01T00:00:01Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:01Z",
          },
        })
        let idArray = [];
        /*values.data.items.forEach(item => {
          console.log(item.contentDetails);
        });*/
        if (values.data.items.length == undefined || values.data.items.length == 0) {
          res.status(500).json({
              error,
          });
          res.render('pages/vidStats', {
              results: [],
              error: true,
              message: error.message,
          });
          return;
        } 

        values.data.items.forEach(item => {
          if(item.contentDetails.playlistItem && item.contentDetails.playlistItem.resourceId.kind == 'youtube#video') {
            let vid = {
              id:item.contentDetails.playlistItem.resourceId.videoId,
              snippet: undefined,
              channel: undefined
            };
            idArray.push(vid);
          }
        });
        
        var temp = [];
        temp = await manyCalls(idArray, values.data.nextPageToken, ourId);

        var info = [];
        info = await vidCall(temp, info, 0);
        //console.log(info);
        /*info.forEach(vid => {
          console.log(vid.snippet.title);
        });*/
        var freqVid = await getFreqVid(info);
        var mostWatched = info.find(vid => vid.id == freqVid)
        
        var sorted = info.sort((c1, c2) => (c1.stats.likeCount < c2.stats.likeCount) ? 1 : (c1.stats.likeCount > c2.stats.likeCount) ? -1 : 0);
        //let likeExtrema = []
        let likeExtrema = sorted[0];
        //likeExtrema[1] = sorted[sorted.length];
        //console.log(likeExtrema[1])


        res.render('pages/vidStats', {
          info,
          mostWatched,
          likeExtrema,
          message: 'happy happy happy',
        });
        
  }
  catch (error) {
      res.status(500).json({
          error,
      });
      res.render('pages/vidStats', {
          results: [],
          error: true,
          message: error.message,
      });
  }
});

app.get('/channelStats', async(req,res) => {
  let ourId = await getChannelID(req.session.user.username);
  try{
    let values = await axios({
          url: `https://www.googleapis.com/youtube/v3/activities`,
          method: 'GET',
          dataType: 'json',
          headers: {
            'Accept-Encoding': 'application/json',
          },
          params: {
            
            part: 'contentDetails', //what sort of data you want returned, i think?
            channelId: ourId,
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
          },
        })
        if (values.data.items.length == undefined || values.data.items.length == 0) {
          res.status(500).json({
              error,
          });
          res.render('pages/channelStats', {
              values: [],
              error: true,
              message: error.message,
          });
          return;
        }
        for(let i = 0; i < values.data.items.length; i++) {
          //console.log('i: ', i);
          if (values.data.items[i].contentDetails.subscription) {
            //console.log('CONFIRMED');
            //idArray[idArray.length].id = values.data.items[i].contentDetails.playlistItem.resourceId.videoId;
            /*let vid = {
              id:values.data.items[i].contentDetails.playlistItem.resourceId.videoId,
              snippet: undefined,
              channel: undefined
            };
            idArray.push(vid);*/
          }
        }
        let temp = []
        temp = await manyChCalls(temp, values.data.nextPageToken);
        res.render('pages/channelStats', {
          values,
          message: 'happy happy happy',
        })
  }
  catch(error){
    res.status(500).json({
      error,
  });
  res.render('pages/channelStats', {
      results: [],
      error: true,
      message: error.message,
  });
  }
});

app.get('/profile', async (req,res) => {
  //let handle = req.session.user.username;
  try {
    let values = await axios({
      url: `https://www.googleapis.com/youtube/v3/channels`,
      method: 'GET',
      dataType: 'json',
      headers: {
        'Accept-Encoding': 'application/json',
      },
      params: {
        part: 'snippet', //what sort of data you want returned, i think?
        forHandle: req.session.user.username, //put channel name/handle here, duh. should fetch from user on log in?
        key: process.env.API_KEY,
      },
    })
    let myChannel = values.data.items[0];
    res.render('pages/profile', {
        myChannel,
        username: req.session.user.username,
        email: req.session.user.email,
        password: req.session.user.password,
    });
  }
  catch(error) {
    res.render('pages/profile', {
      error: error,
      username: req.session.user.username,
      email: req.session.user.email,
      password: req.session.user.password,
    });
  }
});

app.get('/stats1', (req,res) => {
    axios({
        url: `https://www.googleapis.com/youtube/v3/channels`,
        method: 'GET',
        dataType: 'json',
        headers: {
          'Accept-Encoding': 'application/json',
        },
        params: {
          
          part: 'id', //what sort of data you want returned, i think?
          forHandle: req.session.user.username, //put channel Id here, duh. should fetch from user on log in?
          key: process.env.API_KEY,
        },
      })
        .then(results => {
          console.log(results.data); // the results will be displayed on the terminal if the docker containers are running // Send some parameters
          //channelID = results.data.items[0].id;
          res.render('pages/stats1', {
            results,
            message: 'happy happy happy',
          });
        })
        .catch(error => {
            res.status(500).json({
                error,
             });
             res.render('pages/stats1', {
                results: [],
                error: true,
                message: error.message,
            });
        });

    //return channelID;
    //res.render('pages/stats1');
})

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.render('pages/login');
});

app.get('/welcome', (req, res) => {
    res.json({status: 'success', message: 'Welcome!'});
  });
// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
//app.listen(3000);
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');