const { execSync } = require('child_process');

const S3_BUCKET = 's3://reijne.com'; // Your S3 bucket name
const CLOUDFRONT_DISTRIBUTION_ID = 'E1M1RRJJS6YZJU'; // Your CloudFront distribution ID

try {
    // 1. Check if branch is up to date
    console.log('🔍 Checking if the branch is up to date...');

    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const localCommit = execSync('git rev-parse HEAD').toString().trim();
    const remoteCommit = execSync(`git rev-parse origin/${branch}`).toString().trim();

    if (localCommit !== remoteCommit) {
        throw new Error('❌ Local branch is not up to date with remote. Push your changes first.');
    }

    // 2. Check for unstaged and uncommitted changes
    console.log('🔍 Checking for uncommitted and unstaged changes...');
    const status = execSync('git status --porcelain').toString().trim();

    if (status) {
        console.error('🚨 Detected the following uncommitted or unstaged changes:');
        console.log(status);
        throw new Error(
            '❌ You have uncommitted or unstaged changes. Please commit or stash them before deploying.',
        );
    }

    // 3. Build the project
    console.log('🚀 Building the project...');
    execSync('npm run build', { stdio: 'inherit' });

    // 4. Deploy to S3
    console.log(`☁️  Deploying to S3 bucket: ${S3_BUCKET}...`);
    execSync(`aws s3 sync build/ ${S3_BUCKET} --delete`, { stdio: 'inherit' });

    // 5. Invalidate CloudFront Distribution
    console.log(`🌀 Invalidating CloudFront distribution: ${CLOUDFRONT_DISTRIBUTION_ID}...`);
    execSync(
        `aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --paths "/*"`,
        { stdio: 'inherit' },
    );

    console.log(`🎉 Deployment and invalidation successful!`);
} catch (error) {
    console.error('\n🚨 Deployment failed: ', error.message);
    process.exit(1);
}
