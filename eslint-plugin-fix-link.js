// eslint-plugin-fix-link.js
export default {
  rules: {
    "valid-link": {
      meta: { type: "problem", fixable: "code" },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (node.name.name === "Link") {
              const toAttr = node.attributes.find(
                (attr) => attr.name && attr.name.name === "to"
              );

              if (!toAttr) {
                context.report({
                  node,
                  message: "<Link> doit avoir un attribut 'to'",
                  fix(fixer) {
                    return fixer.insertTextAfter(node.name, ' to="/"');
                  },
                });
              }

              const hrefAttr = node.attributes.find(
                (attr) => attr.name && attr.name.name === "href"
              );
              if (hrefAttr) {
                context.report({
                  node,
                  message: "<Link> doit utiliser 'to' au lieu de 'href'",
                  fix(fixer) {
                    return fixer.replaceText(hrefAttr.name, "to");
                  },
                });
              }
            }
          },
        };
      },
    },
  },
};
