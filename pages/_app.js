import { LiveblocksProvider } from "@liveblocks/react";
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <LiveblocksProvider publicApiKey="pk_dev_M40kZIerUUGrzhTzDQZvbIS_tsetnf8C-13hu8fofAFGB5kCVlSw09fxU6_uuzNQ">
      <Component {...pageProps} />
    </LiveblocksProvider>
  );
}

export default MyApp;
