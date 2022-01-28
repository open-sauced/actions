import CFonts from "cfonts";

const consoleHeader = (input, settings = {}) => CFonts.say(input, {
  font: 'tiny',
  align: 'left',
  colors: ['system'],
  background: 'transparent',
  letterSpacing: 1,
  lineHeight: 1,
  space: true,
  maxLength: '0',
  gradient: ["#DC5D3E", "#F2D84A"],
  independentGradient: false,
  transitionGradient: true,
  env: 'node',
  ...settings
})

export default consoleHeader
