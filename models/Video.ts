import mongoose from "mongoose";

const { Schema } = mongoose;

const VideoSchema = new Schema({
    title: String,
    vidURL: String,
    userId: { type: Schema.Types.ObjectId, ref: "User" }
})

const Video = mongoose.model("Video" ,VideoSchema);

export default Video;