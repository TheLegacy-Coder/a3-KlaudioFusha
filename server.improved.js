const express = require("express");
const fs = require("fs");
const mime = require("mime");

require('dotenv').config()

const { ObjectId, MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.USER}:${process.env.PASS}@${process.env.HOST}`

const app = express();
const port = 3000;

const passport = require('passport');
const session = require('express-session');
const GitHubStrategy = require('passport-github').Strategy;

passport.use(new GitHubStrategy({
      clientID: `${process.env.CLIENTID}`,
      clientSecret: `${process.env.CLIENTSECRET}`,
      callbackURL: "http://localhost:3000/auth/github/callback"
    },
    function(accessToken, refreshToken, profile, done) {
      const user = {
        githubId: profile.id,
        username: profile.username,
        accessToken: accessToken,
        refreshToken: refreshToken,
        profile: profile
      };

      // Save the user to MongoDB database


      collection2.insertOne(user, (err, result) => {
        if (err) {
          return done(err);
        }
        // Pass the user object to the done callback
        done(null, user);
      });
    }
));

app.use(session({
  secret: `${process.env.SECRETKEY}`,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

app.get('/', ensureAuthenticated, (req, res) => {
  sendFile(res, "public/index.html");
});

// Login page route
// app.get('/login', (req, res) => {
//   res.send('Login Page'); // Replace with your login page content
// });

app.get('/login', passport.authenticate('github'));

app.get('/auth/github/callback',
    passport.authenticate('github',
        { failureRedirect: '/login', successRedirect: '/public/index.html' }),
    function(req, res) {
      // Successful authentication, redirect home.
      return res.redirect('/');
    }
);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let collection = null
let collection2 = null

async function run() {
  try {
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    collection = await client.db("Workout_Data").collection("workouts");
    collection2 = await client.db("Workout_Data").collection("users");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}).catch(console.error);

app.get("/", (req, res) => {
  sendFile(res, "public/index.html");
});



app.use(async (req, res, next) => {
  try {
    if (collection !== null) {
      next();
    } else {
      throw new Error("MongoDB connection not yet established");
    }
  } catch (err) {
    console.error(err);
    res.status(503).send("Service Unavailable");
  }
});

app.use(express.static("public"));

app.use(express.json());

app.post( '/add', async (req,res) => {
  console.log("Reached function");
  console.log(req.body);

  const startingTime = new Date("2024-01-01 " + req.body.starting_time);
  let endingTime = new Date("2024-01-01 " + req.body.ending_time);
  if (endingTime < startingTime) {
    endingTime = new Date("2024-01-02 " + req.body.ending_time);
  }
  let totalMinutes = (endingTime - startingTime) / (60000); // Convert milliseconds to minutes

  const totalWorkoutDuration = `${Math.floor(totalMinutes / 60)} hour ${totalMinutes % 60} minutes`;

  const estimated_calories = calcEstCaloriesBurned(
      req.body.workout_type,
      req.body.workout_intensity,
      totalMinutes
  );

  req.body.totalWorkoutDuration = totalWorkoutDuration;
  req.body.estimated_calories = estimated_calories;
  req.body._id = await collection.insertOne(req.body);

  res.json( req.body )
})

app.delete( '/remove', async (req,res) => {
  console.log(req.body)
  const result = await collection.deleteOne({
    _id:new ObjectId( req.body.workout_id )
  })

  console.log(result)
  res.json( result )
})

app.put( '/update', async (req,res) => {

  const startingTime = new Date("2024-01-01 " + req.body.json.starting_time);
  let endingTime = new Date("2024-01-01 " + req.body.json.ending_time);
  if (endingTime < startingTime) {
    endingTime = new Date("2024-01-02 " + req.body.json.ending_time);
  }
  let totalMinutes = (endingTime - startingTime) / (60000); // Convert milliseconds to minutes

  const estimated_calories = calcEstCaloriesBurned(
      req.body.json.workout_type,
      req.body.json.workout_intensity,
      totalMinutes
  );

  req.body.json.estimated_calories = estimated_calories

  await collection.updateOne(
      { _id: new ObjectId( req.body.json.workout_id ) },
      { $set:{ starting_time:req.body.json.starting_time,
          ending_time:req.body.json.ending_time,
          workout_type:req.body.json.workout_type,
          workout_intensity:req.body.json.workout_intensity,
          estimated_calories:estimated_calories } }
  )

  console.log(req.body)
  res.json( req.body.json )
})

app.get("/workout_data", async (req, res) => {
  try {
    const data = await collection.find().toArray();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

function sendFile(res, filename) {
  const type = mime.getType(filename);
  fs.readFile(filename, (err, content) => {
    if (err === null) {
      res.header("Content-Type", type);
      res.end(content);
    } else {
      res.status(404).end("404 Error: File Not Found");
    }
  });
}

function calcEstCaloriesBurned(workoutType, workoutIntensity, workoutDurationMins) {
  let caloriesBurnedPerMin;

  switch (workoutType) {
    case "Soccer":
      caloriesBurnedPerMin = 8;
      break;
    case "Football":
      caloriesBurnedPerMin = 9;
      break;
    case "Boxing":
      caloriesBurnedPerMin = 8;
      break;
    case "Wrestling":
      caloriesBurnedPerMin = 9;
      break;
    default:
      caloriesBurnedPerMin = 0;
      break;
  }

  switch (workoutIntensity) {
    case "Low":
      caloriesBurnedPerMin *= 0.47;
      break;
    case "Medium":
      caloriesBurnedPerMin *= 0.75;
      break;
    case "High":
      caloriesBurnedPerMin *= 1.10;
      break;
    default:
      break;
  }

  return (caloriesBurnedPerMin * workoutDurationMins).toFixed(2);
}