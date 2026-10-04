// Stub for `react-native-svg/css` subpath, which only exists in
// react-native-svg >= 14.  The project pins react-native-svg@13.x (no `/css`
// entry), but react-native-qrcode-svg@6.3.12 statically imports it for its
// `logo` (LocalSvg) feature.  We never pass a logo, so this branch is never
// executed at runtime — this stub only satisfies Metro's static resolution.
import { Svg } from 'react-native-svg'

export const LocalSvg = (props) => <Svg {...props} />
export default LocalSvg
