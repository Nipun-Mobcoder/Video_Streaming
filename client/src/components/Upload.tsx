import { useState } from "react";
import axios from "axios";

const Upload = () => {

    function isVideo(url: string) {
        const cleanUrl = url.split('?')[0];
        return /\.(mp4)$/i.test(cleanUrl);
    }
    
    const [uploadProgress, setUploadProgress] = useState<number>(0);

    const handleFileUpload = async (file: File) => {
        try {
            const data = await axios.post<{url: string}>(`${import.meta.env.VITE_API_URL}/uploads3`,
                {key: file.name},
                {headers: { "authorization": localStorage.getItem("user:token") || "" }}
            )
            console.log("File uploaded successfully, URL:", data);
            const {url} = data.data;
            await axios.put(url, file, {
                headers: {
                    "Content-Type": file.type,
                },
                onUploadProgress: (progressEvent) => {
                    const percentComplete = Math.round(
                        (progressEvent.loaded / (progressEvent?.total ?? 100)) * 100
                    );
                    setUploadProgress(percentComplete);
                    console.log(`Upload Progress: ${percentComplete}%`);
                },
            });
            await axios.get(`${import.meta.env.VITE_API_URL}/uploadSuccess?key=${file.name}`,{headers: { "authorization": localStorage.getItem("user:token") || "" }} );
            alert("File uploaded successfully!");
        } catch (error) {
            console.error("Error during file upload:", error);
            alert("Failed to upload file.");
        }
    };

    return (
        <form onSubmit={(e) => e.preventDefault()}>
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
                Upload
            </label>
        </form>
    );
};

export default Upload;
