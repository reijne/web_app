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

    // 5. Create CloudFront Invalidation
    console.log(
        `🌀 Creating CloudFront invalidation for distribution: ${CLOUDFRONT_DISTRIBUTION_ID}...`,
    );
    const invalidationOutput = execSync(
        `aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --paths "/*"`,
        { encoding: 'utf-8' },
    );

    const invalidationIdMatch = invalidationOutput.match(/"Id":\s*"([^"]+)"/);
    const invalidationId = invalidationIdMatch ? invalidationIdMatch[1] : null;

    if (!invalidationId) {
        throw new Error('❌ Failed to extract invalidation ID from the response.');
    }

    console.log(`🕒 Waiting for invalidation ${invalidationId} to complete...`);

    // 6. Poll Invalidation Status
    let invalidationStatus = 'InProgress';
    while (status === 'InProgress') {
        const result = execSync(
            `aws cloudfront get-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --id ${invalidationId}`,
            { encoding: 'utf-8' },
        );
        invalidationStatus = JSON.parse(result).Invalidation.Status;
        console.log(`🔄 Invalidation status: ${invalidationStatus}`);

        if (status === 'InProgress') {
            console.log('⏳ Still in progress... waiting 10 seconds.');
            execSync('sleep 2');
        }
    }

    console.log(`✅ Invalidation ${invalidationId} completed successfully!`);
    console.log(`🎉 Deployment and invalidation process finished!`);
} catch (error) {
    console.error('\n🚨 Deployment failed: ', error.message);
    process.exit(1);
}