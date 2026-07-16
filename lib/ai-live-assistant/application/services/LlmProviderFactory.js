import assert from 'node:assert/strict';

// Les 4 fournisseurs du cahier des charges sont bien supportés
assert.deepEqual([...SUPPORTED_PROVIDERS].sort(), ['claude', 'gemini', 'openai', 'vertex']);

// Instanciation par nom, avec options transmises à l'adaptateur
{
  const provider = createLlmProvider('claude', { apiKey: 'sk-test' });
  assert.equal(provider.name, 'claude');
  assert.equal(typeof provider.generate, 'function');
}

{
  const provider = createLlmProvider('openai', { apiKey: 'sk-test' });
  assert.equal(provider.name, 'openai');
}

{
  const provider = createLlmProvider('gemini', { apiKey: 'gm-test' });
  assert.equal(provider.name, 'gemini');
}

{
  const provider = createLlmProvider('vertex', {
    project: 'fritok-prod',
    getAccessToken: async () => 'x',
  });
  assert.equal(provider.name, 'vertex');
}


// Nom inconnu → erreur explicite, jamais un silencieux undefined
assert.throws(() => createLlmProvider('mistral'), /fournisseur inconnu "mistral"/);

// resolveDefaultProviderName : lit l'env, replie sur 'claude' si absent
assert.equal(resolveDefaultProviderName({}), 'claude');
assert.equal(resolveDefaultProviderName({ AI_LLM_PROVIDER: 'gemini' }), 'gemini');

console.log('✅ LlmProviderFactory.test.js — tous les tests passent');