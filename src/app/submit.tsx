import axios, { type AxiosResponse } from "axios";
import { useEffect, useState } from "react";
import Image from "next/image";
import create from "./axiosInstance";

const axiosSubmit = create("insert-submission");

const Submit = (props: {
    itemId: number,
    teamId: number | string,
    setRefetchSubmissions: (value: boolean) => void,
}) => {
    const { itemId, teamId, setRefetchSubmissions } = props;
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [ipfsHash, setIpfsHash] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const image = e.target.files[0];
            compressImage(image);
            setSelectedImage(image);
        }        
    };

    const compressImage = (image: File) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const imageElement = document.createElement("img");
        imageElement.src = URL.createObjectURL(image);
        imageElement.onload = () => {
            canvas.width = imageElement.width;
            canvas.height = imageElement.height;
            ctx?.drawImage(imageElement, 0, 0, imageElement.width, imageElement.height);
            canvas.toBlob((blob) => {
                const compressedImage = new File([blob as Blob], image.name, {
                    type: "image/jpeg",
                    lastModified: Date.now()
                });
                setSelectedImage(compressedImage);
            }, "image/jpeg", 0.7);
        }
    }

    const handleSubmit = () => {
        if (!selectedImage) {
            return;
        }

        setIsUploading(true);

        const formData = new FormData();
        formData.append("file", selectedImage);
        console.log("formData: ", formData);

        const pinataMetadata = JSON.stringify({
            name: selectedImage.name
        });
        formData.append("pinataMetadata", pinataMetadata);

        const pinataOptions = JSON.stringify({
            cidVersion: 0
        });
        formData.append("pinataOptions", pinataOptions);


        try{
            axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
            maxBodyLength: 10000,
            headers: {
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA}`
            }
            }).then((res: AxiosResponse) => {
                console.log(res);
                setIsUploading(false);
                setIpfsHash(res.data.IpfsHash);
            });
        } catch (error) {
            console.log(error);
            setIsUploading(false);
        }
    }

    useEffect(() => {
        if (ipfsHash) {
            const url = process.env.NEXT_PUBLIC_IPFS_GATEWAY + ipfsHash;
            console.log("ipfs url: ", url);

            // Insert submission into db
            axiosSubmit.post("/", {
                object: {
                    image_url: url,
                    item_id: itemId,
                    team_id: teamId,
                    status: "pending",
                    time_submitted: new Date().toISOString()
                }
            }).then((res) => {
                console.log("insert into db: ", res);
                setRefetchSubmissions(true);
                setSelectedImage(null);
                setIpfsHash("");
            }).catch((error) => {
                console.error(error);
            });
        }
    }, [ipfsHash, itemId, setRefetchSubmissions, teamId]);

    return (
        <div className="space-y-3">
            <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hw-file-input"
            />
            {selectedImage && 
                <Image
                    src={URL.createObjectURL(selectedImage)}
                    alt="selected"
                    width={0}
                    height={0}
                    sizes="100vh"
                    className="h-auto w-full rounded-lg"
                />
            }
            {selectedImage && (
                <button className="hw-button-primary w-full" onClick={handleSubmit}>
                    Submit photo
                </button>
            )}
            {isUploading &&
                <div className="hw-modal">
                    Uploading... Please wait...
                </div>
            }
        </div>
    );
}

export default Submit;
