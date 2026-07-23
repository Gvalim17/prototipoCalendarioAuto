import { ArrowLeft, CalendarDays } from 'lucide-react';

export const PRIVACY_POLICY_VERSION = '2026-07';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    <div className="text-sm text-muted leading-relaxed space-y-2">{children}</div>
  </section>
);

const Terms = () => {
  const canGoBack = window.history.length > 1;

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
              <CalendarDays className="text-accent-fg" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">CronEdu</h1>
              <p className="text-xs text-muted">Termos de Uso e Política de Privacidade</p>
            </div>
          </div>
          {canGoBack && (
            <button onClick={() => window.history.back()} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
        </div>

        <div className="card p-6 sm:p-8 space-y-7">
          <div>
            <p className="text-xs text-faint">Versão {PRIVACY_POLICY_VERSION} · Última atualização: julho de 2026</p>
            <p className="text-sm text-muted mt-3 leading-relaxed">
              Este documento reúne os Termos de Uso e a Política de Privacidade do CronEdu
              ("Sistema"), uma ferramenta de apoio à coordenação acadêmica para geração e organização de
              cronogramas de aulas. Ao criar uma conta, você concorda com os termos abaixo e com o
              tratamento dos seus dados pessoais nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção
              de Dados Pessoais — LGPD) e da Lei nº 12.965/2014 (Marco Civil da Internet).
            </p>
          </div>

          <Section title="1. Quem somos e o que o Sistema faz">
            <p>
              O Sistema é operado pela instituição de ensino ou organização contratante responsável por
              esta instância (a "Instituição"), que atua como controladora dos dados pessoais tratados,
              nos termos do art. 5º, VI, da LGPD. O Sistema é utilizado por coordenadores e professores
              para cadastrar cursos, módulos e disciplinas, gerar cronogramas de aulas considerando
              feriados e recessos, planejar aulas e receber alertas sobre a agenda.
            </p>
          </Section>

          <Section title="2. Cadastro e uso da conta">
            <p>
              O acesso ao Sistema exige cadastro com nome, e-mail e senha (ou autenticação via Google).
              Você é responsável por manter suas credenciais em sigilo e por todas as atividades realizadas
              com sua conta. É proibido: (i) compartilhar credenciais de acesso com terceiros não
              autorizados; (ii) utilizar o Sistema para fins ilícitos ou que violem direitos de terceiros;
              (iii) tentar acessar dados ou funcionalidades sem autorização; (iv) realizar engenharia
              reversa, varredura automatizada ou qualquer ataque à infraestrutura do Sistema.
            </p>
            <p>
              A Instituição pode suspender ou encerrar contas em caso de uso indevido, fraude ou violação
              destes Termos, mediante comunicação ao titular sempre que possível.
            </p>
          </Section>

          <Section title="3. Dados pessoais coletados">
            <p>Tratamos os seguintes dados pessoais, na medida do necessário para o funcionamento do Sistema:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dados de identificação e contato: nome e e-mail informados no cadastro.</li>
              <li>Dados de autenticação: senha (armazenada com hash criptográfico, nunca em texto puro) ou identificador de conta Google, quando aplicável.</li>
              <li>Dados de uso: cursos, módulos, disciplinas, cronogramas e planos de aula que você cadastra.</li>
              <li>Dados técnicos e de sessão: endereço IP, data/hora de acesso e registros de eventos de segurança (login, tentativas de acesso), usados para prevenção a fraude e auditoria.</li>
            </ul>
          </Section>

          <Section title="4. Finalidade e base legal do tratamento">
            <p>Os dados pessoais são tratados para as seguintes finalidades e bases legais (art. 7º da LGPD):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Execução de contrato/procedimento preliminar (art. 7º, V):</strong> criar e manter sua conta, autenticar seus acessos e disponibilizar as funcionalidades do Sistema.</li>
              <li><strong>Legítimo interesse (art. 7º, IX):</strong> prevenção a fraude, registro de eventos de segurança e melhoria da qualidade do serviço, sempre de forma proporcional e sem prejudicar seus direitos fundamentais.</li>
              <li><strong>Cumprimento de obrigação legal ou regulatória (art. 7º, II):</strong> quando aplicável, para atender exigências legais da Instituição.</li>
              <li><strong>Consentimento (art. 7º, I):</strong> para o próprio aceite destes Termos e desta Política, registrado com data e versão no momento do cadastro.</li>
            </ul>
          </Section>

          <Section title="5. Compartilhamento de dados">
            <p>
              Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins comerciais.
              Seus dados podem ser processados por prestadores de infraestrutura (hospedagem de banco de
              dados e aplicação, envio de e-mails transacionais) estritamente para viabilizar o
              funcionamento do Sistema, sempre sob obrigação contratual de confidencialidade e segurança.
              Dados podem também ser divulgados quando exigido por ordem judicial ou autoridade competente.
            </p>
          </Section>

          <Section title="6. Cookies e sessão">
            <p>
              Utilizamos cookies estritamente necessários para manter sua sessão autenticada e proteger o
              Sistema contra ataques (cookie de sessão e cookie de proteção CSRF). Não utilizamos cookies
              de rastreamento publicitário ou de terceiros. Ao encerrar a sessão ("Sair") ou expirar o
              prazo de validade, os cookies deixam de autenticar o acesso.
            </p>
          </Section>

          <Section title="7. Retenção e eliminação dos dados">
            <p>
              Seus dados são mantidos enquanto sua conta estiver ativa e pelo tempo necessário ao
              cumprimento das finalidades descritas, ou de obrigação legal aplicável. Você pode solicitar a
              eliminação da sua conta e dos dados pessoais associados a qualquer momento, diretamente pela
              tela "Privacidade" do Sistema, ressalvados os registros que a legislação exija manter por
              prazo determinado (ex.: registros de segurança).
            </p>
          </Section>

          <Section title="8. Seus direitos como titular de dados (art. 18 da LGPD)">
            <p>Você tem direito a, mediante solicitação:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a lei;</li>
              <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
              <li>Eliminação dos dados pessoais tratados com base no seu consentimento;</li>
              <li>Informação sobre entidades com as quais os dados foram compartilhados;</li>
              <li>Revogação do consentimento, a qualquer momento;</li>
              <li>Revisão de decisões automatizadas que afetem seus interesses.</li>
            </ul>
            <p>
              Os direitos de acesso aos dados e de eliminação da conta podem ser exercidos diretamente na
              tela "Privacidade" do Sistema. Para as demais solicitações, entre em contato com o
              encarregado de proteção de dados (DPO) da Instituição pelo canal informado por ela.
            </p>
          </Section>

          <Section title="9. Segurança da informação">
            <p>
              Adotamos medidas técnicas e administrativas para proteger os dados pessoais contra acessos
              não autorizados e situações acidentais ou ilícitas de destruição, perda, alteração,
              comunicação ou difusão (art. 46 da LGPD), incluindo: senhas armazenadas com hash
              criptográfico, comunicação cifrada (HTTPS), controle de acesso por perfil, limitação de
              tentativas de login e registro de eventos de segurança. Nenhum sistema é absolutamente
              imune a incidentes; caso ocorra um incidente de segurança que possa acarretar risco a você,
              a Instituição comunicará os titulares afetados e a Autoridade Nacional de Proteção de Dados
              (ANPD), conforme exigido pelo art. 48 da LGPD.
            </p>
          </Section>

          <Section title="10. Alterações destes Termos">
            <p>
              Podemos atualizar estes Termos e esta Política periodicamente. Alterações relevantes serão
              comunicadas dentro do próprio Sistema, e o uso continuado após a atualização representa
              ciência dos novos termos. A versão vigente no momento do seu cadastro fica registrada na sua
              conta.
            </p>
          </Section>

          <Section title="11. Contato">
            <p>
              Dúvidas sobre estes Termos ou sobre o tratamento dos seus dados pessoais podem ser
              direcionadas ao encarregado de proteção de dados (DPO) indicado pela Instituição responsável
              por esta instância do Sistema.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
};

export default Terms;
