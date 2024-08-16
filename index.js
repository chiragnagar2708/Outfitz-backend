const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const validator = require("validator");
const bcrypt = require("bcrypt");
const fs = require('fs');
const cloudinary=require('./cloudinary');

require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);  

const port = process.env.PORT || 4000


app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URL);

//API Creation

app.get("/", (req, res) =>{
    res.send("Express App is running")
})


// Set up storage engine
const storage = multer.diskStorage({
    destination: './uploads/', // Path to store uploaded files temporarily
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${path.basename(file.originalname)}`);
    }
  });

const upload=multer({storage}).single('image');
  
const Product = mongoose.model("Product", {
    id:{
        type: Number,
        required:true,
    },
    name:{
        type: String,
        required: true,
    },
    image:{
        type: String,
        required:true,
    },
    category:{
        type:String,
        required:true,
    },
    new_price:{
        type:Number,
        required:true,
    },
    old_price:{
        type:Number,
        required: true,
    },
    date:{
        type:Date,
        default:Date.now,
    },
    available:{
        type: Boolean,
        default:true,
    },
})

app.post('/addproduct', async (req, res) => {
    try {
        upload(req, res, async function (err) {
            if (err) {
                return res.status(500).json({ success: false, message: "Error uploading file" });
            }

            let products = await Product.find({});
            let id;
            let imageUrl = '';

            // Handle file upload to Cloudinary
            if (req.file) {
                try {
                    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                        folder: 'product-images',
                    });
                    imageUrl = uploadResult.secure_url;
                    console.log("File uploaded to Cloudinary:", req.file.path);
                    fs.unlink(req.file.path, (err) => {
                        if (err) console.error("Error deleting local file:", err);
                    });
                } catch (uploadErr) {
                    return res.status(500).json({ success: false, message: "Error uploading to Cloudinary" });
                }
            }

            // Determine the new product ID
            if (products.length > 0) {
                let last_product = products[products.length - 1];
                id = last_product.id + 1;
            } else {
                id = 1;
            }

            // Create and save the new product
            const product = new Product({
                id: id,
                name: req.body.name,
                image: imageUrl,
                category: req.body.category,
                new_price: req.body.new_price,
                old_price: req.body.old_price,
            });

            await product.save();
            console.log("Product saved:", product);
            res.json({ success: true, name: req.body.name });
        });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

//Creating API for deleting product
app.post('/removeproduct', async (req, res) => {
    await Product.findOneAndDelete({id: req.body.id});
    console.log("Removed");
    res.json({
        success:true,
        name: req.body.name
    })
})

//Creating API for all products
app.get('/allproducts', async (req, res) => {
    let products = await Product.find({});
    console.log("All Products Fetched");
    res.send(products);
})

//Schema creating for user model
const Users = mongoose.model('Users', {
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
    },
    password: {
        type: String,
        required: true,
    },
    cartData: {
        type: Object,
    },
    date: {
        type: Date,
        default: Date.now,
    }
})

// Creating Endpoint for registering the user
app.post('/signup', async(req, res) => {

    const { username, email, password } = req.body;

    if(!username || !email || !password)
    {
        return res.status(400).json({success: false, errors: "Please fill all details"});
    }

    if(!validator.isEmail(email)){
        return res.status(400).json({success: false, errors: "Please Provide a valid email"});
    }

    if (password.length < 8) {
        return res.status(400).json({ success: false, errors: "Password must be at least 8 characters long" });
    }

    let check = await Users.findOne({email: req.body.email});

    if(check){
        return res.status(400).json({success: false, errors: "Existing User"})
    }

    let cart = {};
    for(let i=0; i<300; i++){
        cart[i] = 0;
    }

    hashpassword = await bcrypt.hash(password, 10);

    const user = new Users({
        name: username,
        email: email,
        password: hashpassword,
        cartData: cart,
    })

    await user.save();

    const data = {
        user: {
            id: user.id
        }
    }

    const token = jwt.sign(data, 'secret_ecom');
    res.json({success: true, token})
})

//creating endpoint for user login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if(!email || !password)
    {
        return res.status(400).json({success: false, errors: "Please fill all details"});
    }

    if(!validator.isEmail(email)){
        return res.status(400).json({success: false, errors: "Please Provide a valid email"});
    }

    let user = await Users.findOne({email: email});

    if(user){
        const passCompare = await bcrypt.compare(password, user.password);
        if(passCompare){
            const data = {
                user: {
                    id: user.id
                }
            }

            const token = jwt.sign(data, 'secret_ecom');
            res.json({success: true, token});
        }
        else{
            res.json({success: false, errors: "Incorrect Password"});
        }
    }
    else{
        res.json({success: false, errors: "Incorrect email id"});
    }
})

//Creating endpoint for newcollection data
app.get('/newcollections', async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    console.log("NewCollection Fetched");
    res.send(newcollection);
})

//Creating endpoint for relatedProducts data
app.get('/relatedProducts', async (req, res) => {
    let products = await Product.find({});
    let relatedProducts = products.slice(1).slice(-4);
    console.log("Related Products Fetched");
    res.send(relatedProducts);
})

//Creating endpoint for popular in women section
app.get('/popularinwomen', async(req, res) => {
    let products = await Product.find({category: "women"})
    let popular_in_women = products.slice(0,4);
    // let popular_in_women = products.slice(1).slice(-4);
    console.log("Popular in women fetched")
    res.send(popular_in_women);
})

// Creating middleware to fetch user
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');

    if(!token){
        res.status(401).send({errors: "Please authenticate using valid token"})
    }
    else{
        try{
            const data = jwt.verify(token, 'secret_ecom');
            req.user = data.user;
            next();
        }
        catch(error){
            res.status(401).send({errors: "Please authenticate using a valid token"})
        }
    }
}

// Creating endpoint for adding products in cartdata
app.post('/addtocart', fetchUser, async (req, res) => {
    console.log("added", req.body.itemId);
    let userData = await Users.findOne({_id: req.user.id});
    userData.cartData[req.body.itemId] += 1;
    await Users.findByIdAndUpdate({_id: req.user.id}, {cartData: userData.cartData});
    res.json({message: "Added"})
})

//Creating endpoint to remove product from cartdata
app.post('/removefromcart', fetchUser, async(req, res) => {
    console.log("removed", req.body.itemId);
    let userData = await Users.findOne({_id: req.user.id});
    if(userData.cartData[req.body.itemId] > 0){
        userData.cartData[req.body.itemId] -= 1;
    }
    await Users.findByIdAndUpdate({_id: req.user.id}, {cartData: userData.cartData});
    res.json({message: "Removed"})
})

//Creating endpoint to get cartdata
app.post('/getcart', fetchUser, async (req, res) => {
    console.log("GetCart");
    let userData = await Users.findOne({_id: req.user.id});
    res.json(userData.cartData);
})

//Creating endpoint for Checkout
app.post("/create-checkout-session", async(req, res) => {
    const {products} = req.body;

    const lineItems = products.map((product) =>({
        price_data:{
            currency: "USD",
            product_data:{
                name: product.name,
            },
            unit_amount: product.new_price*100,
        },
        quantity: product.quantity,
    }))

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/success`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    res.json({id: session.id});
});


app.post('/clear-cart', fetchUser, async (req, res) => {
    const userId = req.user.id;
    
    try {
        let cart = {};
        for(let i=0; i<300; i++){
            cart[i] = 0;
        }
        await Users.findByIdAndUpdate(userId, { cartData: cart, new: true });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Server error" });
    }
});

app.listen(port, (error) => {
    if(!error){
        console.log("Server running on Port " + port)
    }
    else{
        console.log("Error : " + error)
    }
})