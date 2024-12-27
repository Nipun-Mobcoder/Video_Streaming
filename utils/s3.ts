import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

export const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

export const uploadToS3 = (path: string, filename: string, mimetype: string) => {
  const s3Params = {
    Bucket: process.env.S3_BUCKET_NAME || '',
    Key: `${uuidv4()}-${filename}`,
    Body: readFileSync(path),
    ContentType: mimetype,
  };
  return s3.upload(s3Params).promise();
};

export const getPresignedUrl = (key: string) => {
  const s3Params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Expires: 60 * 60,
  };
  return s3.getSignedUrlPromise('getObject', s3Params);
};