/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.mypinata.cloud',
                port: '',
            }
        ],
    },
};

export default nextConfig;
