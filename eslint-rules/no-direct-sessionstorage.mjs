export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow direct usage of sessionStorage',
            category: 'Best Practices',
            recommended: true,
        },
        schema: [], // No options
    },
    create(context) {
        return {
            MemberExpression(node) {
                if (
                    node.object.name === 'sessionStorage'
                    // && node.parent.type !== 'CallExpression'
                ) {
                    context.report({
                        node,
                        message:
                            'Use the `SessionStorage` wrapper object instead of sessionStorage directly.',
                    });
                }
            },
        };
    },
};
