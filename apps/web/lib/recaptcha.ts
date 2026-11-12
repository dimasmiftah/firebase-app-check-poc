import { ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { clientEnv } from "./env";

export function createRecaptchaProvider() {
  return new ReCaptchaEnterpriseProvider(clientEnv.recaptcha.siteKey);
}
