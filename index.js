const express = require('express')
const app = express()
const port = process.env.PORT || 5000;
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.STRIPE_PK)

//Middleware
app.use(cors())
app.use(express.json());

//verify jwt token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {

    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_Token, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


//mongoDB config
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Pass}@cluster0.zi72aqo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db("Capture_Camp").collection("users");
    const classCollection = client.db("Capture_Camp").collection("class")
    const selectedClassCollection = client.db("Capture_Camp").collection("selected_class")
    const paymentCollection = client.db("Capture_Camp").collection("payment_history")
    const reviewCollection = client.db("Capture_Camp").collection("reviews")
    const photoCollection = client.db("Capture_Camp").collection("student_photos")
    ////////////////////////////////////////
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_Token, { expiresIn: '6h' })
      res.send({ token })
    })


    app.get('/', (req, res) => {
      res.send('Welcome to Capture Camp!')
    })


    //use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      // console.log(user)
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }
    ///verifyInstructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      // console.log(user)
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }
    ///verify Student
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      // console.log(query)
      const user = await usersCollection.findOne(query);
      // console.log(user)
      if (user?.role !== 'student') {
        // console.log('hit')
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    // users related apis
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    ///update role of a user
    app.patch('/users/makeadmin/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const doc = {
        $set: { role: 'admin' }
      }
      const result = await usersCollection.updateOne(query, doc)

      res.send(result)
    })
    app.patch('/users/makeinstuctor/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const doc = {
        $set: { role: 'instructor' }
      }
      const result = await usersCollection.updateOne(query, doc)

      res.send(result)
    })

    //all instructor
    app.get('/users/allinstructor', async (req, res) => {

      const instructors = await usersCollection.aggregate([
        {
          $match: { role: 'instructor' }
        },
//////////
{
  $lookup: {
    from: 'class', // Replace 'classCollection' with your actual collection name
    localField: 'email',
    foreignField: 'email',
    as: 'classes'
  }
},
{
  $addFields: {
    numClasses: {
      $size: {
        $filter: {
          input: '$classes',
          as: 'class',
          cond: { $eq: ['$$class.status', 'accepted'] }
        }
      }
    },
    classNames: {
      $map: {
        input: {
          $filter: {
            input: '$classes',
            as: 'class',
            cond: { $eq: ['$$class.status', 'accepted'] }
          }
        },
        as: 'class',
        in: '$$class.class'
      }
    }
  }
},




        // {
        //   $lookup: {
        //     from: 'class', // Replace 'classCollection' with your actual collection name
        //     localField: 'email',
        //     foreignField: 'email',
        //     as: 'classes'
        //   }
        // },
        // {
        //   $addFields: {
        //     numClasses: { $size: '$classes' },
        //     classNames: '$classes.class' // Add this line to include the class names
        //   }
        // },
        {
          $project: {
            _id: 1,
            name: 1,
            email:1,
            photo:1,
            numClasses: 1,
            classNames: 1 // Include the classNames field in the projection
          }
        }
      ]).toArray();
      
      res.send(instructors);
      // const query = { role: 'instructor' }
      // const result = await usersCollection.find(query).toArray();
      // res.send(result);
    });
    //create user
    app.post('/users', async (req, res) => {
      const user = req.body;

      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });


    //get classes by email
    app.get('/class', verifyJWT, verifyInstructor, async (req, res) => {

      const email = req.query.email;
      const query = { email: email }
      const result = await classCollection.find(query).toArray()
      res.send(result);
    })
    //get all class
    app.get('/allclass', async (req, res) => {
      const result = await classCollection.find().toArray()
      res.send(result);
    })
    //get approved class
    app.get('/approvedclass', async (req, res) => {
      // console.log('hit')
      const query = { status: 'accepted' }
      const result = await classCollection.find(query).toArray()
      res.send(result);
    })
    // get top six approved class
    app.get('/topapprovedclass', async (req, res) => {
      // console.log('hit');
      const query = { status: 'accepted' };
      const result = await classCollection.find(query).sort({ student: -1 }).limit(6).toArray();
      res.send(result);
    })
    //get top Instructor 
    app.get('/topInstructor', async (req, res) => {
      const query = { status: 'accepted' };
      const result = await classCollection.aggregate([
        { $match: query }, // Filter by status: 'accepted'
        {
          $lookup: {
            from: 'users', // Replace 'instructorCollection' with your actual collection name
            localField: 'email', // Field in the 'classCollection' that links to the instructor
            foreignField: 'email', // Field in the 'instructorCollection' that matches the instructor's ID
            as: 'top_instructor' // Name of the field that will hold the instructor information
          }
        },
        {
          $sort: { student: -1 } // Sort by 'student' field in descending order
        },
        {
          $limit: 6 // Retrieve only 6 top instructor with the highest number of students
        }
      ]).toArray();
      res.send(result)
    })

    //get selected classes by user email
    app.get('/selectedclass', verifyJWT, verifyStudent, async (req, res) => {

      const email = req.query.email;
      const query = { student_email: email }
      const result = await selectedClassCollection.find(query).toArray()
      res.send(result)
    })
    //get selected classes by id
    app.get('/selectedclass/:id', verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await selectedClassCollection.findOne(query)
      res.send(result)
    })
    //select and store class
    app.post('/selectedclass', verifyJWT, verifyStudent, async (req, res) => {
      const data = req.body
      const existingClass = await selectedClassCollection.findOne({
        className: data.className,email:data.student_email               
      })
      const existingEnrolledClass = await paymentCollection.findOne({
        class_id:data.class_id,email:data.student_email
      })
       if (existingEnrolledClass) {
        console.log(existingEnrolledClass)
        return res.send({ msg: 'enrolled' })
      }

      else if (existingClass) {
        return res.send({ msg: 'duplicate' })
      }
  
      else {
        const result = await selectedClassCollection.insertOne(data)
        res.send(result);
      }

    })

    //Enrolled Class
    app.get('/enrolledclass',verifyJWT,async(req,res)=>{
        const email=req.query.email
        query={email:email}
      // console.log(email)
      const result = await paymentCollection.aggregate([
        { $match: { email } }, // Filter by email
        {
          $lookup: {
            from: 'class', // Replace with your actual collection name for classes
            let: { classId: { $toObjectId: '$class_id' } },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$classId'] } } }
            ],
            as: 'classInfo'
          }
        }
      ]).toArray()

        res.send(result)

    })

    //delete  stored class
    app.delete('/selectedclass/:id', async (req, res) => {

      const id = req.params.id;
      // console.log('hit', id)
      const query = { _id: new ObjectId(id) }
      const result = await selectedClassCollection.deleteOne(query)
      res.send(result)
    })
    //accept class
    app.patch('/allclass/:id', verifyJWT, async (req, res) => {
      const sts = req.query.sts
      const feedback = req.query.feedback
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }

      if (sts) {
        const doc = {
          $set: {
            status: sts,
          }
        }
        const result = await classCollection.updateOne(query, doc, options)
        res.send(result);
      }
      else {
        const doc = {
          $set: {
            feedback: feedback
          }
        }
        const result = await classCollection.updateOne(query, doc, options)
        res.send(result);
      }

    })

    //add class
    app.post('/class', verifyJWT,verifyInstructor, async (req, res) => {
      const newItem = req.body;
      const result = await classCollection.insertOne(newItem)
      res.send(result);
    })

    //update class
    app.put('/updateclass/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const seats = req.body.availableSeats
      const price = req.body.price
      const query = { _id: new ObjectId(id) }
      const doc = {
        $set: {
          seats: seats,
          price: price
        }
      }
      const result = await classCollection.updateOne(query, doc)
      res.send(result)
    })



    // check admin
    app.get('/users/admin/:email',  async (req, res) => {
      const email = req.params.email;

      // if (req.decoded.email !== email) {
      //  return res.send({ admin: false })
      // }
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    // check instructor
    app.get('/users/instructor/:email', async (req, res) => {
      const email = req.params.email;
      
      // if (req.decoded.email !== email) {
      //  return  res.send({ instructor: false })
      // }
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })

    // check student
    app.get('/users/student/:email', async (req, res) => {
      const email = req.params.email;

      // if (req.decoded.email !== email) {
      //  return res.send({ student: false })
      // }
      
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { student: user?.role === 'student' }
      res.send(result);
    })



    //payment
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"]
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    ////store payment history
    app.post('/payments', async (req, res) => {
      const data = req.body
      ///delete selected class
      console.log(data.selected_class_id)
      const selected_classID = data.selected_class_id

      const query={_id:new ObjectId(selected_classID)}
      const deleteResult = await selectedClassCollection.deleteOne(query)
      ///incress student in that class
      const class_Id = data.class_id
      const updateStudent = await classCollection.updateOne({ _id: new ObjectId(class_Id) }, { $inc: { student: 1, seats: -1 } })

      const result = await paymentCollection.insertOne(data)
      res.send({ result, deleteResult, updateStudent })
    })

    //get payment history
    app.get('/paymenthistory',verifyJWT, async (req, res) => {
      const email=req.query.email;
      const query={email:email}
   
      const result = await paymentCollection.find(query).sort({date:-1}).toArray()
      res.send(result)
    })


    /////////////////////////////
    //reviews store//

    app.post('/reviews',verifyJWT, async (req, res) => {
 

      const data = req.body
      console.log(data)


      const existingClass = await reviewCollection.findOne({
        className: data.className , username:data.username
      })
 
      if (existingClass) {
        console.log(data.className,data.user)
        return res.send({ msg: 'duplicate' })
      }
      else {

        const result = await reviewCollection.insertOne(data)
        res.send(result);
      }
 
    })
   //get reviews
    app.get('/reviews',async(req,res)=>{

      const result = await reviewCollection.find().toArray()

      res.send(result)
    })
       //get photos
       app.get('/photos',async(req,res)=>{
        const email=req.query.email

        if(email){
          const query={email:email}
          const result = await photoCollection.find(query).toArray()
          console.log(result)
          return res.send(result)
        }
        else{
          const result = await photoCollection.find().toArray()
          console.log(result)
          return res.send(result)
        }
    
      })

    /////post photo
    app.post('/photos',verifyJWT,verifyStudent,async(req,res)=>{
      const data=req.body;
      const result=await photoCollection.insertOne(data)
      res.send(result)
    })

    ////////////

    app.listen(port, () => {
      console.log(`Capture Camp app listening on port ${port}`)
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

















