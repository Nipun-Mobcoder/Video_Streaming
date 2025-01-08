import ffmpeg from 'fluent-ffmpeg';

const getVideoDuration = (videoPath: string) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .ffprobe((err, metadata) => {
                if (err) {
                    reject(err);
                } else {
                    const totalFrames = metadata.format.duration;
                    resolve(totalFrames);
                }
            });
    });
};

export default getVideoDuration;