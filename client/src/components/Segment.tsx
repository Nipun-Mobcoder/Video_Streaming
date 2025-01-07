import { useEffect, useState } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";

const Segment = ({ setURL }: { setURL: React.Dispatch<React.SetStateAction<string>> }) => {

    function isVideo(url: string) {
        const cleanUrl = url.split('?')[0];
        return /\.(mp4)$/i.test(cleanUrl);
    }
    
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [ socket, setSocket ] = useState<Socket>();

    useEffect (() => {
        setSocket((io('http://localhost:4040')));
    }, []);

    useEffect (() => {
        socket?.on('video_stream', (data: number) => {
            setUploadProgress(data)
        })
      }, [socket])

    const handleFileUpload = async (file: File) => {
        try {
            const formData = new FormData();
            formData.append("file", file);
            const data = await axios.post<{videoUrl: string}>(`${import.meta.env.VITE_API_URL}/uploadCourse`,
                formData,
                {headers: { "authorization": localStorage.getItem("user:token") || "", }}
            )
            console.log("File uploaded successfully, URL:", data);
            setURL(data.data.videoUrl);
        } catch (error) {
            console.error("Error during file upload:", error);
            alert("Failed to upload file.");
        }
    };

    console.log(uploadProgress);

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
                Segment
            </label>
        </form>
    );
};

export default Segment;
