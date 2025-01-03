import axios from "axios";

const MultipartUpload = () => {

    function isVideo(url: string) {
        const cleanUrl = url.split('?')[0];
        return /\.(mp4)$/i.test(cleanUrl);
      }

    const handleFileUpload = async (file: File) => {
        try {
            const totalSize = file.size;
            const partNumbers = Math.ceil(totalSize / 10000000);
            const data = await axios.post<{uploadId: string}>("http://localhost:5000/startMultipart",
                {fileName: file.name, contentType: file.type},
                {headers: { "authorization": localStorage.getItem("user:token") || "" }}
            )
            console.log(data);
            const {uploadId} = data.data;
        
            if (uploadId) {
                const generateData = await axios.post<{presignedUrls: string}>("http://localhost:5000/generateMultipart",
                    { fileName: file.name, uploadId, partNumbers },
                    {headers: { "authorization": localStorage.getItem("user:token") || "" }}
                );
        
                const {presignedUrls} = generateData.data;
                if (presignedUrls) {
                    const parts:{ etag: string; PartNumber: number }[] = [];
                    const uploadPromises = [];
            
                    for (let i = 0; i < partNumbers; i++) {
                    const start = i * 10000000;
                    const end = Math.min(start + 10000000, totalSize);
                    const chunk = file.slice(start, end);
                    const presignedUrl = presignedUrls[i];
            
                    uploadPromises.push(
                        axios.put(presignedUrl, chunk, {
                        headers: {
                            "Content-Type": file.type,
                        },
                        })
                    );
                    }
        
                const uploadResponses = await Promise.all(uploadPromises);
        
                uploadResponses.forEach((response, i) => {
                    parts.push({
                        etag: response.headers.etag,
                        PartNumber: i + 1,
                    });
                });

                await axios.post<{presignedUrl: string}>("http://localhost:5000/completeMultipart",
                    { fileName: file.name, uploadId, parts },
                    {headers: { "authorization": localStorage.getItem("user:token") || "" }}
                )
            }
        }
        } catch (error) {
            console.error("Error during file upload:", error);
            alert("Failed to upload file.");
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
        </form>
    );
};

export default MultipartUpload;