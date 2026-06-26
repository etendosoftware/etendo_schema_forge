import LoginStep from './LoginStep.jsx';
import RegisterStep from './RegisterStep.jsx';
import EnvSelectStep from './EnvSelectStep.jsx';
import ProfileStep from './ProfileStep.jsx';
import CompanyStep from './CompanyStep.jsx';
import SetupProgressStep from './SetupProgressStep.jsx';

export const coreSteps = [
  { id: 'login', component: LoginStep },
  { id: 'register', component: RegisterStep },
  { id: 'env-select', component: EnvSelectStep },
  { id: 'profile', component: ProfileStep },
  { id: 'company', component: CompanyStep },
  { id: 'setup-progress', component: SetupProgressStep },
];
