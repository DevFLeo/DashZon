require_relative "test_helper"

class DocumentoTest < Minitest::Test
  def test_cpf_valido_com_e_sem_mascara
    assert_equal %w[cpf 52998224725], Documento.validar!("529.982.247-25")
    assert_equal %w[cpf 52998224725], Documento.validar!("52998224725")
  end

  def test_cpf_invalido
    assert_raises(Documento::Invalido) { Documento.validar!("529.982.247-24") }
    assert_raises(Documento::Invalido) { Documento.validar!("111.111.111-11") } # dígitos repetidos
  end

  def test_cnpj_valido_e_invalido
    assert_equal %w[cnpj 11222333000181], Documento.validar!("11.222.333/0001-81")
    assert_raises(Documento::Invalido) { Documento.validar!("11.222.333/0001-80") }
  end

  def test_tipo_nao_aceito
    erro = assert_raises(Documento::Invalido) { Documento.validar!("52998224725", aceitos: %w[cnpj]) }
    assert_match(/CNPJ/, erro.message)
  end

  def test_tamanho_errado
    assert_raises(Documento::Invalido) { Documento.validar!("123") }
  end

  def test_mascara_nao_mostra_o_numero_todo
    assert_equal "***.982.247-**", Documento.mascarar("cpf", "52998224725")
    assert_equal "**.***.333/0001-**", Documento.mascarar("cnpj", "11222333000181")
  end
end
