import axios from "axios";

const Upload = () => {

    function isVideo(url: string) {
        const cleanUrl = url.split('?')[0];
        return /\.(mp4)$/i.test(cleanUrl);
      }

    const handleFileUpload = async (file: File) => {
        try {
            const data = await axios.post<{url: string}>("http://localhost:5000/uploads3",
                {key: file.name},
                {headers: { "authorization": localStorage.getItem("user:token") || "" }}
            )
            console.log("File uploaded successfully, URL:", data);
            const {url} = data.data;
            await axios.put(url, file, {
                headers: {
                    "Content-Type": file.type,
                },
            });
            await axios.get(`http://localhost:5000/uploadSuccess?key=${file.name}`,{headers: { "authorization": localStorage.getItem("user:token") || "" }} );
            alert("File uploaded successfully!");
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
                Upload
            </label>
        </form>
    );
};

export default Upload;
