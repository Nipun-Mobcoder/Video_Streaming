import express, { Request } from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { getPresignedUrl, putPresignedUrl, uploadToS3 } from './utils/s3.js';
import connectDB from './config/db.js';
import User from './models/User.js';
import jwt from "jsonwebtoken";
import { authenticateToken } from './utils/configToken.js';
import Video from './models/Video.js';

const app = express();
dotenv.config();

app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true
    })
)

const storage = multer.diskStorage({
    destination: function(req, file, cb){
      cb(null, "./uploads")
    },
    filename: function(req, file, cb){
      cb(null, file.fieldname + "-" + uuidv4() + path.extname(file.originalname))
    }
  })
  
const upload = multer({storage});

interface AuthenticatedRequest extends Request {
    user?: { email: string; id: string; userName: string };
}

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*") 
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next()
  })

app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use("/uploads", express.static("uploads"))

if(!process.env.JWT_Secret) { 
    throw new Error("JWT secret is absent.")
}

app.get("/", (req, res) => {
    res.send("Hello World");
})

app.post("/upload", authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: "No file uploaded" });
        }
        const lessonId = uuidv4()
        const videoPath = req.file?.path
        const outputPath = `./uploads/courses/${lessonId}`
        const hlsPath = `${outputPath}/index.m3u8`
        console.log("hlsPath", hlsPath)
    
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, {recursive: true})
        }
    
        const ffmpegCommand = `ffmpeg -i ${videoPath} -codec:v libx264 -codec:a aac -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 ${hlsPath}`;
    
        exec(ffmpegCommand, async (error, stdout, stderr) => {
            if (error) {
               console.log(`exec error: ${error}`)
            }
            console.log(`stdout: ${stdout}`)
            console.log(`stderr: ${stderr}`)
            const videoUrl = `http://localhost:5000/uploads/courses/${lessonId}/index.m3u8`;

            const userData = req.user as { email: string; id: string; userName: string };

            const {id} = userData;
            const user = User.find({ id });
            if(!user) res.status(401).json({ message: "User was not found." });

            await Video.create({ userId:id, vidURL: videoUrl, title: req.file?.filename });
    
            res.json({
                message: "Video converted to HLS format",
                videoUrl,
                lessonId
            })
        })
    } catch (e) {
        console.log(e);
        res.status(400).json(e)
    }
})

app.post("/upload-s3", authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
        if(!req.file) 
            res.status(400).json({ message: "No file uploaded" });
        else {
            const userData = req.user as { email: string; id: string; userName: string };
            const { path, filename, mimetype } = req.file;
            if (!path || !filename || !mimetype)
                res.status(400).json({ message: "Invalid file data" });
            const uploadResult = await uploadToS3(path, filename, mimetype);
         
            const presignedUrl = await getPresignedUrl(uploadResult.Key);
            
            const {id} = userData;
            const user = User.find({ id });
            if(!user) res.status(401).json({ message: "User was not found." });

            await Video.create({ userId:id, vidURL: uploadResult.Location, title: filename });

            res.json({
                message: "Video uploaded successfully.",
                url: presignedUrl
            })
        }
    } catch (error) {
        console.error("Error during file upload:", error);
        res.status(500).json({ message: "Error uploading file" });
    }
})

app.post("/uploadS3", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
        const userData = req.user as { email: string; id: string; userName: string };
        
        const presignedUrl = await putPresignedUrl(req.body.key);
        
        const {id} = userData;
        const user = User.find({ id });
        if(!user) res.status(401).json({ message: "User was not found." });

        res.json({
            message: "Video uploaded successfully.",
            url: presignedUrl
        })
    } catch (error) {
        console.error("Error during file upload:", error);
        res.status(500).json({ message: "Error uploading file" });
    }
})

app.get("/uploadSuccess", authenticateToken, async (req: AuthenticatedRequest, res)=> {
    try {
        const userData = req.user as { email: string; id: string; userName: string };
        const vidURL = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.query.key}`;
        const {id} = userData;
        const user = User.find({ id });
        if(!user) res.status(401).json({ message: "User was not found." });
        await Video.create({ userId:id, vidURL, title: req.query.key });
        const presignedUrl = await getPresignedUrl(req.query.key as string);
        res.json({
            message: "Video uploaded successfully.",
            url: presignedUrl
         })
    } catch (e: any) {
        console.log(e);
        res.status(500).json({ message: e?.message ?? "Looks like something went wrong." })
    }
})

app.post("/register", async (req, res) => {
    try {
        const { userName, password, email } = req.body;
        if( !userName || !password || !email )
            res.status(500).json({
                message: "Invalid Credentials"
            })
        await User.create({
                userName,
                password,
                email
            })
        res.json({userName, password, email});
    } catch (e) {
        console.log(e);
        res.status(400).json({ message: "Looks like something went wrong." });
    }
})

app.post("/login", async (req, res) => {
    const jwtSecret = process.env.JWT_Secret as string;
    try {
        const { password, email } = req.body;
        const userDoc = await User.findOne({ email });
        if (userDoc && password === userDoc.password) {
            const token = jwt.sign({ email: userDoc.email, id: userDoc._id, userName: userDoc.userName }, jwtSecret);
            res.json({token, name: userDoc.userName, email: userDoc.email, id: userDoc._id.toString()});
        } else {
            res.status(501).json({ message: "Invalid Credentials" });
        }
    } catch (e: any) {
        console.log(e);
        res.status(400).json({ message: e?.message ?? "Looks like something went wrong." });
    }
})

connectDB();
app.listen(5000, () => {
    console.log("App is listening on http://localhost:5000");
})