module.exports = {
  title: "Motiva Docs",
  tagline: "Sistema de roçagem inteligente",
  url: "http://localhost:3001",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  favicon: "img/favicon.ico",

  organizationName: "motiva",
  projectName: "roçagem",

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
};
