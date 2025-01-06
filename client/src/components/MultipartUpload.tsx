import axios from "axios";
import { useState } from "react";

const CHUNK_SIZE = 10 * 1024 * 1024;

const MultipartUpload = () => {

    function isVideo(url: string) {
        const cleanUrl = url.split('?')[0];
        return /\.(mp4)$/i.test(cleanUrl);
      }

    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const handleFileUpload = async (file: File) => {
        try {
            const totalSize = file.size;
            const partNumbers = Math.ceil(totalSize / CHUNK_SIZE);
            
            const data = await axios.post<{uploadId: string}>(`${import.meta.env.VITE_API_URL}/startMultipart`,
                {fileName: file.name, contentType: file.type},
                {headers: { "authorization": localStorage.getItem("user:token") || "" }}
            )
            console.log(data);
            const {uploadId} = data.data;
        
            if (uploadId) {
                const generateData = await axios.post<{presignedUrls: string[]}>(`${import.meta.env.VITE_API_URL}/generateMultipart`,
                    { fileName: file.name, uploadId, partNumbers },
                    {headers: { "authorization": localStorage.getItem("user:token") || "" }}
                );
        
                const {presignedUrls} = generateData.data;
                if (presignedUrls) {
                    const parts:{ etag: string; PartNumber: number }[] = [];
                    const uploadPromises = [];
                    let totalUploaded = 0;
            
                    for (let i = 0; i < partNumbers; i++) {
                        const start = i * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, totalSize);
                        const chunk = file.slice(start, end);
                        const presignedUrl = presignedUrls[i];
                        let chunkUploaded = 0;

                        uploadPromises.push(
                            axios.put(presignedUrl, chunk, {
                                headers: { "Content-Type": file.type },
                                onUploadProgress: (progressEvent) => {
                                    const chunkProgress = progressEvent.loaded - chunkUploaded;
                                    chunkUploaded = progressEvent.loaded;
                                    totalUploaded += chunkProgress;
                                    const overallProgress = Math.round((totalUploaded * 100) / totalSize);
                                    console.log(`Upload Progress: ${overallProgress}%`);
                                    setUploadProgress(overallProgress);
                                },
                            })
                        );
                    }
        
                    const uploadResponses = await Promise.all(uploadPromises);
                    uploadResponses.forEach((response, i) => {
                        parts.push({
                            etag: response.headers.etag,
                            PartNumber: i + 1
                        });
                    });

                    await axios.post(`${import.meta.env.VITE_API_URL}/completeMultipart`,
                        { fileName: file.name, uploadId, parts },
                        {headers: { "authorization": localStorage.getItem("user:token") || "" }}
                    )

                    alert("File uploaded successfully!");
                }
            }
        } catch (error) {
            console.error("Error during file upload:", error);
            alert("Failed to upload file.");
        } finally {
            setUploadProgress(0);
        }
    };

    return (
        <form onSubmit={(e) => e.preventDefault()}>
            <input
                type="file"
                onChange={(e) => {
                    if (e.target.files) {
                        if(isVideo(e.target.files[0].name))
                            handleFileUpload(e.target.files[0]);
                        else
                            alert("File should be a video.")
                    }
                }}
                style={{ display: 'none' }}
                id="file-input"
            />
            <label
                htmlFor="file-input"
                style={{
                    display: 'inline-block',
                    backgroundColor: 'white',
                    color: 'black',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    borderRadius: '5px',
                    border: '1px solid black',
                    textAlign: 'center',
                }}
            >
                Multipart Upload
            </label>
            {uploadProgress > 0 && (
                <div style={{ marginTop: "20px" }}>
                    <div
                        style={{
                            width: "100%",
                            backgroundColor: "#f3f3f3",
                            border: "1px solid #ccc",
                        }}
                    >
                        <div
                            style={{
                                width: `${uploadProgress}%`,
                                backgroundColor: "#4caf50",
                                textAlign: "center",
                                color: "white",
                                padding: "5px 0",
                            }}
                        >
                            {uploadProgress}%
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
};

export default MultipartUpload;