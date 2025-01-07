import ffmpeg from 'fluent-ffmpeg';

const getVideoFrame = (videoPath: string) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .ffprobe((err, metadata) => {
                if (err) {
                    reject(err);
                } else {
                    const totalFrames = metadata.streams[0].nb_frames;
                    resolve(totalFrames);
                }
            });
    });
};

export default getVideoFrame;