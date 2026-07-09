from datetime import date

from app.services.holiday_importer import parse_holiday_file


def test_parse_holiday_file_accepts_portuguese_columns_and_br_dates():
    content = (
        "Data,Descrição,Tipo,Fonte\n"
        "25/12/2026,Natal,nacional,Calendário oficial\n"
    ).encode("utf-8")

    result = parse_holiday_file("feriados.csv", content)

    assert result["errors"] == []
    assert result["total_rows"] == 1
    assert result["rows"][0].date == date(2026, 12, 25)
    assert result["rows"][0].description == "Natal"
    assert result["rows"][0].type == "nacional"
    assert result["rows"][0].source == "Calendário oficial"


def test_parse_holiday_file_keeps_valid_rows_and_reports_invalid_rows():
    content = (
        "date,description,type\n"
        "2026-01-01,Confraternização,nacional\n"
        "sem-data,Registro inválido,nacional\n"
        "2026-04-21,,nacional\n"
    ).encode("utf-8")

    result = parse_holiday_file("feriados.csv", content)

    assert len(result["rows"]) == 1
    assert result["rows"][0].date == date(2026, 1, 1)
    assert result["errors"] == [
        {"row": 3, "field": "date", "message": "data inválida: sem-data"},
        {"row": 4, "field": "description", "message": "descrição vazia"},
    ]


def test_parse_holiday_file_rejects_missing_required_columns():
    content = "Dia,Nome\n25/12/2026,Natal\n".encode("utf-8")

    try:
        parse_holiday_file("feriados.csv", content)
    except ValueError as exc:
        assert "Colunas obrigatórias ausentes" in str(exc)
    else:
        raise AssertionError("missing required columns should fail")


def test_parse_holiday_file_accepts_user_csv_format_with_short_dates():
    content = (
        "Data,Feriado,Esfera,Tipo,Observações\n"
        "01/01,Confraternização Universal,Nacional,Feriado,Nacional\n"
        "20/01,São Sebastião,Municipal (Rio de Janeiro),Feriado,Padroeiro da cidade do Rio de Janeiro\n"
    ).encode("utf-8")

    result = parse_holiday_file("feriados.csv", content, default_year=2026)

    assert result["errors"] == []
    assert result["rows"][0].date == date(2026, 1, 1)
    assert result["rows"][0].description == "Confraternização Universal"
    assert result["rows"][0].type == "feriado"
    assert result["rows"][0].source == "Nacional"
    assert result["rows"][1].date == date(2026, 1, 20)
    assert result["rows"][1].source == "Municipal (Rio de Janeiro) - Padroeiro da cidade do Rio de Janeiro"


def test_parse_holiday_file_calculates_known_movable_holidays():
    content = (
        "Data,Feriado,Esfera,Tipo,Observações\n"
        "Data móvel,Carnaval (Terça-feira),Estadual (Rio de Janeiro),Feriado,Feriado estadual\n"
        "Data móvel,Segunda-feira de Carnaval,N/A,Ponto Facultativo,Normalmente adotado no Rio de Janeiro\n"
        "Data móvel,Quarta-feira de Cinzas (até 14h),N/A,Ponto Facultativo,Normalmente adotado no Rio de Janeiro\n"
        "Data móvel,Sexta-feira Santa,Nacional,Feriado,Paixão de Cristo\n"
        "Data móvel,Corpus Christi,N/A,Ponto Facultativo,Normalmente adotado pela Prefeitura e Governo do Estado\n"
    ).encode("utf-8")

    result = parse_holiday_file("feriados.csv", content, default_year=2026)
    dates_by_name = {row.description: row.date for row in result["rows"]}

    assert result["errors"] == []
    assert dates_by_name["Carnaval (Terça-feira)"] == date(2026, 2, 17)
    assert dates_by_name["Segunda-feira de Carnaval"] == date(2026, 2, 16)
    assert dates_by_name["Quarta-feira de Cinzas (até 14h)"] == date(2026, 2, 18)
    assert dates_by_name["Sexta-feira Santa"] == date(2026, 4, 3)
    assert dates_by_name["Corpus Christi"] == date(2026, 6, 4)
