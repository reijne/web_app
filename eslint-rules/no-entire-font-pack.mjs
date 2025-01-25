export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow importing the entire FontAwesome icon pack, enforce individual icon imports.',
            category: 'Best Practices',
            recommended: false,
        },
        schema: [], // no options
    },

    create(context) {
        return {
            ImportDeclaration(node) {
                const literal = node.source.value

                const forbiddenPackages = [
                    '@fortawesome/free-solid-svg-icons',
                    '@fortawesome/free-regular-svg-icons',
                    '@fortawesome/free-brands-svg-icons',
                ]

                console.log('\n\n\nimportSource:', literal)
                console.log('forbiddenPackages:', forbiddenPackages)

                if (forbiddenPackages.includes(literal)) {
                    context.report({
                        node,
                        message: `Do not import the entire FontAwesome icon pack from "${literal}". Import individual icons instead, e.g. "@fortawesome/free-solid-svg-icons/faHouse".`,
                    })
                }
            },
        }
    },
}
