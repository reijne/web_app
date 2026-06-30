const { execSync } = require('child_process');

const S3_BUCKET = 's3://reijne.com'; // Your S3 bucket name
const CLOUDFRONT_DISTRIBUTION_ID = 'E1M1RRJJS6YZJU'; // Your CloudFront distribution ID

// Check if branch is up to date
function ensureBranchUpToDate() {
    console.log('🔍 Checking if the branch is up to date...');

    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const localCommit = execSync('git rev-parse HEAD').toString().trim();
    const remoteCommit = execSync(`git rev-parse origin/${branch}`).toString().trim();

    if (localCommit !== remoteCommit) {
        throw new Error('❌ Local branch is not up to date with remote. Push your changes first.');
    }
}

// Check for unstaged and uncommitted changes
function ensureNoUnstagedAndUncommittedChanges() {
    console.log('🔍 Checking for uncommitted and unstaged changes...');
    const status = execSync('git status --porcelain').toString().trim();

    if (status) {
        console.error('🚨 Detected the following uncommitted or unstaged changes:');
        console.log(status);
        throw new Error(
            '❌ You have uncommitted or unstaged changes. Please commit or stash them before deploying.'
        );
    }
}

// Check all linting is in order, including any left over console statements.
function ensureESLintPasses() {
    console.log('🔍 Checking linting including any left over console statements...');
    try {
        const lintOutput = execSync('npm run lint-no-console', { stdio: 'inherit' });
        console.log('lintOut:', lintOutput);
    } catch (error) {
        console.error('🚨 Detected linting issues:');
        console.log(error.stdout);

        throw new Error('❌ Fix all of the issues listed above before deploying..');
    }
}

// Build the project
function build() {
    console.log('🚀 Building the project...');
    execSync('npm run build-with-hash', { stdio: 'inherit' });
}

function deploy() {
    // Deploy to S3
    console.log(`☁️  Deploying to S3 bucket: ${S3_BUCKET}...`);
    execSync(`aws s3 sync build/ ${S3_BUCKET} --delete`, { stdio: 'inherit' });
}

// Create CloudFront Invalidation
function invalidateCloudFrontDistribution() {
    console.log(
        `🌀 Creating CloudFront invalidation for distribution: ${CLOUDFRONT_DISTRIBUTION_ID}...`
    );
    const invalidationOutput = execSync(
        `aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --paths "/*"`,
        { encoding: 'utf-8' }
    );

    const invalidationIdMatch = invalidationOutput.match(/"Id":\s*"([^"]+)"/);
    const invalidationId = invalidationIdMatch ? invalidationIdMatch[1] : null;

    if (!invalidationId) {
        throw new Error('❌ Failed to extract invalidation ID from the response.');
    }

    console.log(`🕒 Waiting for invalidation ${invalidationId} to complete...`);

    execSync(
        `aws cloudfront wait invalidation-completed --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --id ${invalidationId}`,
        { stdio: 'inherit' }
    );

    console.log(`✅ Invalidation ${invalidationId} completed successfully!`);
    console.log(`🎉 Deployment and invalidation process finished!`);
}

try {
    // Checks to see if we are in a state ready for deployment.
    ensureBranchUpToDate();
    ensureNoUnstagedAndUncommittedChanges();
    ensureESLintPasses();

    build();
    deploy();

    invalidateCloudFrontDistribution();
} catch (error) {
    console.error('\n🚨 Deployment failed: ', error.message);
    process.exit(1);
}
