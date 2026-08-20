const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY;
const API_SECRET = import.meta.env.VITE_CLOUDINARY_API_SECRET;

function sha1(str) {
    return crypto.subtle.digest("SHA-1", new TextEncoder().encode(str)).then((buf) => {
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    });
}

export async function uploadToCloudinary(dataUrl, folder = "swachhlens") {
    if (!dataUrl || !dataUrl.startsWith("data:")) return null;
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
        console.warn("Cloudinary not configured — skipping upload. Set VITE_CLOUDINARY_* env vars.");
        return null;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${API_SECRET}`;
    const signature = await sha1(paramsToSign);

    const formData = new FormData();
    formData.append("file", dataUrl);
    formData.append("folder", folder);
    formData.append("timestamp", timestamp);
    formData.append("api_key", API_KEY);
    formData.append("signature", signature);

    const isVideo = dataUrl.startsWith("data:video");
    const resourceType = isVideo ? "video" : "image";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

    const response = await fetch(url, { method: "POST", body: formData });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || "Cloudinary upload failed");
    }
    return response.json();
}

export function getCloudinaryThumbnail(url, width = 400) {
    if (!url || !url.includes("cloudinary.com")) return url;
    return url.replace("/upload/", `/upload/w_${width},f_auto,q_auto/`);
}
