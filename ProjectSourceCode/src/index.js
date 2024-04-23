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

app.get('/register', (req, res) => {
    res.render('pages/register');
});

app.post('/register', async (req, res) => {
    try{
        
        if (req.body.username == req.body.password) {
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
  // function for getting channel id from handle, which we could make people set their handle to.
  // basically, possible way to make application mostly work even if we don't get authentication working.
async function getChannelID(channelName) { 
    axios({
        url: `https://www.googleapis.com/youtube/v3/channels`,
        method: 'GET',
        dataType: 'json',
        headers: {
          'Accept-Encoding': 'application/json',
        },
        params: {
          
          part: 'id', //what sort of data you want returned, i think?
          forHandle: '@erikhaller5880', //put channel name/handle here, duh. should fetch from user on log in?
          key: process.env.API_KEY,
        },
      })
        .then(results => {
          console.log(results.data); // the results will be displayed on the terminal if the docker containers are running // Send some parameters
          return results.data.items[0].id;
        })
        .catch(error => {
            /*res.status(500).json({
                error,
            });*/
        });


}
async function manyCalls(array, nextToken) {
  console.log('manycalls');
  //for (let i = 0; i < 5; i++) {
  while(nextToken) {
      /*console.log('i =');
      console.log(i);
      console.log(nextToken);
      console.log('---------------------------------');*/
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
            //id,
            channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', //put channel Id here, duh. should fetch from user on log in?
            //channelId: 'UCs88GCjP5A3EBJb8QrNNiZQ',
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
            pageToken: nextToken
          },
        })
        //console.log(values.data);
        //console.log(values.data.items.length);
        values.data.items.forEach(item => {
          console.log(item.contentDetails);
        });

        //testIds = await setVals(values);
        //var ids = [];
        for(let j = 0; j<values.data.items.length; j++) {
          if (values.data.items[j].contentDetails.playlistItem) {
              //console.log('CONFIRMED');
              vid = {id: values.data.items[j].contentDetails.playlistItem.resourceId.videoId,
              snippet: undefined};
              array.push(vid);
          }
          //console.log(values.data.items[i].contentDetails);
        }
        /*console.log(array);
        console.log(values.data.nextPageToken);*/
        /*if (values.data.nextPageToken == undefined) {
          console.log('EXITING');
          return array;
        }
        else {*/
          nextToken = values.data.nextPageToken;
          //console.log(nextToken);
        //}
  }
  return array;
}
async function vidCall(array, info) { //was originally going to get highest rated from this, but you need to have auth for that
  //console.log(array);
  let ids = array[0].id;
  var nextToken;
  for (let i = 1; i < array.length; i++) {
      ids = ids.concat(',', array[i].id);
  }
  //try {
    for (let i = 0; i < array.length%50; i++){
      if( i == 0 || nextToken) {
        let values = await axios({
            url: `https://www.googleapis.com/youtube/v3/videos`,
            method: 'GET',
            dataType: 'json',
            headers: {
            'Accept-Encoding': 'application/json',
            },
            params: {
            
            part: 'snippet', //what sort of data you want returned, i think?
            //channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', //put channel Id here, duh. should fetch from user on log in?
            id: ids,
            key: process.env.API_KEY,
            maxResults: 50,//array.length, // you can choose the max number of things you would like to return
            /*publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2023-01-08T00:00:00.0Z",*/
            pageToken: nextToken
            },
        })
        //let info = [];
        if(values.data.nextPageToken) {nextToken = values.data.nextPageToken;}

        //console.log(values.data.items[0].snippet.thumbnails);
        //console.log(values.data.items[0].snippet);
        //console.log(values.data);
        /*var count = values.data.pageInfo.resultsPerPage - 1;

        info[0] = values.data.items[0].snippet;
        info[1] = values.data.items[count].snippet;*/
        for(let i = 0; i < array.length; i++) {
            var vid = {
                id: array[i].id,
                snippet: values.data.items[i].snippet
            };
            info.push(vid);
        }

        //console.log(info);
        //console.log(values.data.items.length);
    }
    }
      return info;
  /*}
  catch(err) {

  }*/
}
async function getMostFrequent(array) {
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
  /*highest = arr[0].id;
  for(let i = 0; i < arr.length; i++) {
    temp = arr[i].id;
  }*/
  return count.id;
};
app.get('/test', async(req,res) => {
  
});

app.get('/home', async(req, res) => {
  //let ourId = await getChannelID('@erikhaller5880');
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
            //channelId: ourId,
            channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', //put channel Id here, duh. should fetch from user on log in?
            //channelId: 'UCs88GCjP5A3EBJb8QrNNiZQ',
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
          },
        })
        let idArray = [];
        /*let idArray = [ {
          id: undefined, snippet: undefined
        }];*/
        /*let objArray = [
          {
              id: undefined,
              snippet: undefined
          }
        ];*/
        
        //console.log(values.data);
        //console.log(values.data.items.length);
        //console.log(videoIds);
        values.data.items.forEach(item => {
          console.log(item.contentDetails);
        });
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

        for(let i = 0; i<values.data.items.length; i++) {
          if (values.data.items[i].contentDetails.playlistItem) {
              //console.log('CONFIRMED');
              //idArray[idArray.length].id = values.data.items[i].contentDetails.playlistItem.resourceId.videoId;
              let vid = {id:values.data.items[i].contentDetails.playlistItem.resourceId.videoId,
              snippet: undefined};
              idArray.push(vid);
          }
          //console.log(values.data.items[i].contentDetails);
        }
        //console.log(videoIds);

        /*if (values.data.items.length > 2) {
          req.session.userInfo.id = 5;
          console.log(req.session.userInfo.id);
        }*/
        
        var temp = [];
        temp = await manyCalls(idArray, values.data.nextPageToken);
        //console.log(temp);
        //await setIds(temp);
        //console.log('MANYCALLS ACCOMPLISHED !!!!!!!!!!!!!!!!!!!!!!!');

        /*userInfo.firstVid = temp[temp.length];
        userInfo.lastVid = temp[0];*/

        var info = [];
        
        info = await vidCall(temp, info);
        //info[0] = values.data.items[0].snippet;
        //console.log(info);
        /*info.forEach(vid => {
          console.log(vid.snippet.title);
        });*/
        var mostFrequent = await getMostFrequent(info);
        var mostWatched = info.find(vid => vid.id == mostFrequent)
        console.log(mostWatched.id);
        //var str = String(info[0]);
        //console.log(typeof info[0]);

        res.render('pages/home', {
          info,
          mostWatched,
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
  //let ourId = await getChannelID('@erikhaller5880');
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
            //channelId: ourId,
            channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', //put channel Id here, duh. should fetch from user on log in?
            //channelId: 'UCs88GCjP5A3EBJb8QrNNiZQ',
            key: process.env.API_KEY,
            maxResults: 50, // you can choose the max number of things you would like to return
            publishedAfter: "2023-01-01T00:00:00.0Z", //this one is kinda hard to figure out. gets all info after date
            publishedBefore: "2024-01-01T00:00:00.0Z",
          },
        })
        let idArray = [];
        values.data.items.forEach(item => {
          console.log(item.contentDetails);
        });
        /*let idArray = [ {
          id: undefined, snippet: undefined
        }];*/
        /*let objArray = [
          {
              id: undefined,
              snippet: undefined
          }
        ];*/
        
        //console.log(values.data);
        //console.log(values.data.items.length);
        //console.log(videoIds);
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

        for(let i = 0; i<values.data.items.length; i++) {
          if (values.data.items[i].contentDetails.playlistItem) {
              //console.log('CONFIRMED');
              //idArray[idArray.length].id = values.data.items[i].contentDetails.playlistItem.resourceId.videoId;
              let vid = {id:values.data.items[i].contentDetails.playlistItem.resourceId.videoId,
              snippet: undefined};
              idArray.push(vid);
          }
          //console.log(values.data.items[i].contentDetails);
        }
        //console.log(videoIds);

        /*if (values.data.items.length > 2) {
          req.session.userInfo.id = 5;
          console.log(req.session.userInfo.id);
        }*/
        
        var temp = [];
        temp = await manyCalls(idArray, values.data.nextPageToken);
        console.log('NEXT PAGE TOKEN:',values.data.nextPageToken);
        //console.log(temp);
        //await setIds(temp);
        //console.log('MANYCALLS ACCOMPLISHED !!!!!!!!!!!!!!!!!!!!!!!');

        /*userInfo.firstVid = temp[temp.length];
        userInfo.lastVid = temp[0];*/

        var info = [];
        
        info = await vidCall(temp, info);
        //info[0] = values.data.items[0].snippet;
        //console.log(info);
        /*info.forEach(vid => {
          console.log(vid.snippet.title);
        });*/
        var mostFrequent = await getMostFrequent(info);
        var mostWatched = info.find(vid => vid.id == mostFrequent)
        console.log(mostWatched.id);
        //var str = String(info[0]);
        //console.log(typeof info[0]);

        res.render('pages/vidStats', {
          info,
          mostWatched,
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

app.get('/profile', (req,res) => {
    res.render('pages/profile', {
        username: req.session.user.username,
        email: req.session.user.email,
        password: req.session.user.password,
    });
});

app.get('/stats1', (req,res) => {
    var channelID;
    axios({
        url: `https://www.googleapis.com/youtube/v3/channels`,
        method: 'GET',
        dataType: 'json',
        headers: {
          'Accept-Encoding': 'application/json',
        },
        params: {
          
          part: 'id', //what sort of data you want returned, i think?
          forHandle: '@erikhaller5880', //put channel Id here, duh. should fetch from user on log in?
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