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

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials',
});

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
            return res.status(400).render('pages/register');
        }

        // get password then compare to see if they match
        const pass = await bcrypt.compare(req.body.password, user.password);
        // redirect to login and send message
        if (!pass) {
            return res.status(400).render('pages/login');
        }

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
  

//app.get('/home', (req,res) => {
//    res.render('pages/home');
//})
app.get('/home', async(req, res) => {
    axios({
        url: `https://www.googleapis.com/youtube/v3/activities`,
        method: 'GET',
        dataType: 'json',
        headers: {
          'Accept-Encoding': 'application/json',
        },
        params: {
          
          part: 'contentDetails', //what sort of data you want returned, i think?
          channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', //put channel Id here, duh. should fetch from user on log in?
          key: process.env.API_KEY,
          maxResults: 10 // you can choose the max number of things you would like to return
          //publishedAfter: 2024-01-01T01:01:01.01+01:00 //this one is kinda hard to figure out. gets all info after date
        },
      })
        .then(results => {
          console.log(results.data); // the results will be displayed on the terminal if the docker containers are running // Send some parameters
          res.render('pages/home', {
            results,
            message: 'happy happy happy',
          });
        })
        .catch(error => {
            res.status(500).json({
                error,
            });
            res.render('pages/home', {
                results: [],
                error: true,
                message: error.message,
            });
        });
    
  });

app.get('/profile', (req,res) => {
    res.render('pages/profile', {
        username: req.session.user.username,
        email: req.session.user.email,
        password: req.session.user.password,
    });
});

app.get('/stats1', (req,res) => {
    res.render('pages/stats1');
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