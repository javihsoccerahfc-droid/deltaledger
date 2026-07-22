/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Vercel enforces its own hard, non-configurable 4.5MB request body limit on every Vercel
    // Function (which is what a Server Action runs as/through in production) -- this Next
    // config value CANNOT override that platform ceiling. Setting it to 10mb here would work
    // locally but still 413 in production for anything over 4.5MB. 4mb leaves headroom under
    // the platform limit for multipart boundary/field overhead. Must stay in sync with
    // MAX_IMPORT_FILE_SIZE_BYTES in src/lib/importLimits.ts, which is what the UI actually
    // validates against client-side before ever calling the Server Action.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
